// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SwapDesk} from "../src/SwapDesk.sol";
import {TestToken} from "../src/TestToken.sol";

/// @dev A maker that cannot receive ETH, to show that a failed payout reverts the whole swap.
contract NoEth {
    function create(SwapDesk desk, address sellToken, uint256 sellAmount, uint256 buyAmount, uint64 expiry)
        external
        returns (uint256)
    {
        TestToken(sellToken).approve(address(desk), sellAmount);
        return desk.createOrder(sellToken, sellAmount, address(0), buyAmount, expiry);
    }
}

contract SwapDeskTest is Test {
    SwapDesk internal desk;
    TestToken internal usd;
    TestToken internal btc;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal constant ETH = address(0);
    uint64 internal expiry;

    event OrderCreated(
        uint256 indexed id,
        address indexed maker,
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint64 expiry
    );
    event OrderFilled(uint256 indexed id, address indexed maker, address indexed taker);
    event OrderCancelled(uint256 indexed id, address indexed maker);

    function setUp() public {
        vm.warp(1_767_225_600); // 2026-01-01
        expiry = uint64(block.timestamp + 1 hours);

        desk = new SwapDesk();
        usd = new TestToken(address(this), "Test USD", "tUSD");
        btc = new TestToken(address(this), "Test Bitcoin", "tBTC");
        usd.mint(alice, 1000 ether);
        btc.mint(bob, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    /// @dev alice offers 100 tUSD for 1 tBTC.
    function _aliceOffersUsdForBtc() internal returns (uint256 id) {
        vm.startPrank(alice);
        usd.approve(address(desk), 100 ether);
        id = desk.createOrder(address(usd), 100 ether, address(btc), 1 ether, expiry);
        vm.stopPrank();
    }

    // ---- create ----

    function test_createOrder_locksTheOfferedTokenAndEmits() public {
        vm.startPrank(alice);
        usd.approve(address(desk), 100 ether);
        vm.expectEmit(true, true, false, true, address(desk));
        emit OrderCreated(1, alice, address(usd), 100 ether, address(btc), 1 ether, expiry);
        uint256 id = desk.createOrder(address(usd), 100 ether, address(btc), 1 ether, expiry);
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(desk.orderCount(), 1);
        assertEq(usd.balanceOf(address(desk)), 100 ether);
        assertEq(usd.balanceOf(alice), 900 ether);

        SwapDesk.Order memory order = desk.getOrder(id);
        assertEq(order.maker, alice);
        assertEq(order.taker, address(0));
        assertEq(order.sellToken, address(usd));
        assertEq(order.sellAmount, 100 ether);
        assertEq(order.buyToken, address(btc));
        assertEq(order.buyAmount, 1 ether);
        assertEq(order.expiry, expiry);
        assertEq(uint8(order.status), uint8(SwapDesk.Status.Open));
        assertTrue(desk.isFillable(id));
    }

    function test_createOrder_rejectsBadInput() public {
        vm.startPrank(alice);
        usd.approve(address(desk), 100 ether);

        vm.expectRevert(SwapDesk.InvalidAmount.selector);
        desk.createOrder(address(usd), 0, address(btc), 1 ether, expiry);
        vm.expectRevert(SwapDesk.InvalidAmount.selector);
        desk.createOrder(address(usd), 100 ether, address(btc), 0, expiry);
        vm.expectRevert(SwapDesk.SameAsset.selector);
        desk.createOrder(address(usd), 100 ether, address(usd), 1 ether, expiry);
        vm.expectRevert(SwapDesk.InvalidExpiry.selector);
        desk.createOrder(address(usd), 100 ether, address(btc), 1 ether, uint64(block.timestamp));

        // A token order must not carry ETH, and an ETH order must carry exactly the offered amount.
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.WrongValue.selector, 0, 1 ether));
        desk.createOrder{value: 1 ether}(address(usd), 100 ether, address(btc), 1 ether, expiry);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.WrongValue.selector, 2 ether, 1 ether));
        desk.createOrder{value: 1 ether}(ETH, 2 ether, address(btc), 1 ether, expiry);
        vm.stopPrank();
    }

    // ---- fill ----

    function test_fillOrder_swapsTokenForTokenAtomically() public {
        uint256 id = _aliceOffersUsdForBtc();

        vm.startPrank(bob);
        btc.approve(address(desk), 1 ether);
        vm.expectEmit(true, true, true, true, address(desk));
        emit OrderFilled(id, alice, bob);
        desk.fillOrder(id);
        vm.stopPrank();

        assertEq(usd.balanceOf(bob), 100 ether);
        assertEq(btc.balanceOf(alice), 1 ether);
        assertEq(btc.balanceOf(bob), 9 ether);
        assertEq(usd.balanceOf(address(desk)), 0);

        SwapDesk.Order memory order = desk.getOrder(id);
        assertEq(order.taker, bob);
        assertEq(uint8(order.status), uint8(SwapDesk.Status.Filled));
        assertFalse(desk.isFillable(id));
    }

    function test_fillOrder_makerSellsEthForToken() public {
        vm.prank(alice);
        uint256 id = desk.createOrder{value: 2 ether}(ETH, 2 ether, address(btc), 1 ether, expiry);
        assertEq(address(desk).balance, 2 ether);

        vm.startPrank(bob);
        btc.approve(address(desk), 1 ether);
        desk.fillOrder(id);
        vm.stopPrank();

        assertEq(bob.balance, 12 ether);
        assertEq(btc.balanceOf(alice), 1 ether);
        assertEq(address(desk).balance, 0);
    }

    function test_fillOrder_makerSellsTokenForEth() public {
        vm.startPrank(alice);
        usd.approve(address(desk), 100 ether);
        uint256 id = desk.createOrder(address(usd), 100 ether, ETH, 3 ether, expiry);
        vm.stopPrank();

        vm.prank(bob);
        desk.fillOrder{value: 3 ether}(id);

        assertEq(alice.balance, 13 ether);
        assertEq(bob.balance, 7 ether);
        assertEq(usd.balanceOf(bob), 100 ether);
        assertEq(address(desk).balance, 0);
    }

    function test_fillOrder_requiresTheExactPayment() public {
        vm.startPrank(alice);
        usd.approve(address(desk), 100 ether);
        uint256 forEth = desk.createOrder(address(usd), 100 ether, ETH, 3 ether, expiry);
        vm.stopPrank();
        uint256 forBtc = _aliceOffersUsdForBtc();

        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.WrongValue.selector, 3 ether, 1 ether));
        desk.fillOrder{value: 1 ether}(forEth);

        btc.approve(address(desk), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.WrongValue.selector, 0, 1 ether));
        desk.fillOrder{value: 1 ether}(forBtc);
        vm.stopPrank();
    }

    function test_fillOrder_failsWithoutFundsAndLeavesTheOrderOpen() public {
        uint256 id = _aliceOffersUsdForBtc();

        vm.startPrank(carol); // carol has no tBTC
        btc.approve(address(desk), 1 ether);
        vm.expectRevert();
        desk.fillOrder(id);
        vm.stopPrank();

        assertTrue(desk.isFillable(id));
        assertEq(usd.balanceOf(address(desk)), 100 ether);
    }

    function test_fillOrder_rejectsMakerExpiredAndClosedOrders() public {
        uint256 id = _aliceOffersUsdForBtc();

        vm.prank(alice);
        vm.expectRevert(SwapDesk.OwnOrder.selector);
        desk.fillOrder(id);

        vm.expectRevert(abi.encodeWithSelector(SwapDesk.UnknownOrder.selector, 99));
        desk.fillOrder(99);

        vm.startPrank(bob);
        btc.approve(address(desk), 5 ether);
        desk.fillOrder(id);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.OrderNotOpen.selector, id));
        desk.fillOrder(id); // cannot be filled twice
        vm.stopPrank();

        uint256 late = _aliceOffersUsdForBtc();
        vm.warp(expiry + 1);
        assertFalse(desk.isFillable(late));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.OrderExpired.selector, late));
        desk.fillOrder(late);
    }

    function test_fillOrder_revertsEntirelyIfTheMakerCannotBePaid() public {
        NoEth maker = new NoEth();
        usd.mint(address(maker), 100 ether);
        uint256 id = maker.create(desk, address(usd), 100 ether, 1 ether, expiry);

        vm.prank(bob);
        vm.expectRevert(SwapDesk.EthTransferFailed.selector);
        desk.fillOrder{value: 1 ether}(id);

        // Nothing moved: bob keeps his ETH, the token is still locked.
        assertEq(bob.balance, 10 ether);
        assertEq(usd.balanceOf(address(desk)), 100 ether);
        assertTrue(desk.isFillable(id));
    }

    // ---- cancel ----

    function test_cancelOrder_returnsTheLockedAsset() public {
        uint256 id = _aliceOffersUsdForBtc();

        vm.prank(bob);
        vm.expectRevert(SwapDesk.NotMaker.selector);
        desk.cancelOrder(id);

        vm.expectEmit(true, true, false, true, address(desk));
        emit OrderCancelled(id, alice);
        vm.prank(alice);
        desk.cancelOrder(id);

        assertEq(usd.balanceOf(alice), 1000 ether);
        assertEq(uint8(desk.getOrder(id).status), uint8(SwapDesk.Status.Cancelled));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.OrderNotOpen.selector, id));
        desk.cancelOrder(id);
    }

    function test_cancelOrder_worksAfterExpiryAndForEth() public {
        vm.prank(alice);
        uint256 id = desk.createOrder{value: 2 ether}(ETH, 2 ether, address(btc), 1 ether, expiry);
        assertEq(alice.balance, 8 ether);

        vm.warp(expiry + 1 days);
        vm.prank(alice);
        desk.cancelOrder(id);
        assertEq(alice.balance, 10 ether);
    }

    function test_getOrder_revertsForUnknownOrder() public {
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.UnknownOrder.selector, 1));
        desk.getOrder(1);
        assertFalse(desk.isFillable(1));
        vm.expectRevert(abi.encodeWithSelector(SwapDesk.UnknownOrder.selector, 1));
        desk.cancelOrder(1);
    }
}
