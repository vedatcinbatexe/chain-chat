// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ChainChat Swap Desk
/// @notice Peer-to-peer token swaps that are offered in a chat and settled on-chain (SDD §6.9).
///         The maker locks what they give in this contract; whoever accepts pays the maker and receives the
///         locked asset in the same transaction. Either both transfers happen or neither does, so neither side
///         has to trust the other — or the chat server.
/// @dev `address(0)` stands for the chain's native ETH. There is no owner and no fee.
contract SwapDesk is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Filled,
        Cancelled
    }

    struct Order {
        address maker;
        address taker; // set when filled
        address sellToken; // what the maker gives (locked here while the order is open)
        uint256 sellAmount;
        address buyToken; // what the maker wants in return
        uint256 buyAmount;
        uint64 expiry; // unix time after which the order can no longer be filled
        Status status;
    }

    /// @notice Number of orders ever created; order ids are 1..orderCount.
    uint256 public orderCount;
    mapping(uint256 id => Order) private _orders;

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

    error InvalidAmount();
    error SameAsset();
    error InvalidExpiry();
    error WrongValue(uint256 expected, uint256 sent);
    error UnknownOrder(uint256 id);
    error OrderNotOpen(uint256 id);
    error OrderExpired(uint256 id);
    error NotMaker();
    error OwnOrder();
    error EthTransferFailed();

    /// @notice Offers `sellAmount` of `sellToken` for `buyAmount` of `buyToken` and locks the offered asset here.
    /// @dev For a token, approve this contract first; for ETH, send exactly `sellAmount` with the call.
    /// @return id The id of the new order.
    function createOrder(address sellToken, uint256 sellAmount, address buyToken, uint256 buyAmount, uint64 expiry)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        if (sellAmount == 0 || buyAmount == 0) revert InvalidAmount();
        if (sellToken == buyToken) revert SameAsset();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        id = ++orderCount;
        _orders[id] = Order({
            maker: msg.sender,
            taker: address(0),
            sellToken: sellToken,
            sellAmount: sellAmount,
            buyToken: buyToken,
            buyAmount: buyAmount,
            expiry: expiry,
            status: Status.Open
        });

        _collect(sellToken, msg.sender, address(this), sellAmount);
        emit OrderCreated(id, msg.sender, sellToken, sellAmount, buyToken, buyAmount, expiry);
    }

    /// @notice Accepts an open order: pays the maker and receives the locked asset, atomically.
    /// @dev For a token, approve this contract first; for ETH, send exactly the order's `buyAmount` with the call.
    function fillOrder(uint256 id) external payable nonReentrant {
        Order storage order = _open(id);
        if (block.timestamp > order.expiry) revert OrderExpired(id);
        if (msg.sender == order.maker) revert OwnOrder();

        order.status = Status.Filled;
        order.taker = msg.sender;

        _collect(order.buyToken, msg.sender, order.maker, order.buyAmount);
        _send(order.sellToken, msg.sender, order.sellAmount);
        emit OrderFilled(id, order.maker, msg.sender);
    }

    /// @notice Withdraws an open order and returns the locked asset to the maker. Also works after it expired.
    function cancelOrder(uint256 id) external nonReentrant {
        Order storage order = _open(id);
        if (msg.sender != order.maker) revert NotMaker();

        order.status = Status.Cancelled;
        _send(order.sellToken, order.maker, order.sellAmount);
        emit OrderCancelled(id, order.maker);
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        Order memory order = _orders[id];
        if (order.status == Status.None) revert UnknownOrder(id);
        return order;
    }

    /// @notice True while the order is open and has not expired.
    function isFillable(uint256 id) external view returns (bool) {
        Order storage order = _orders[id];
        return order.status == Status.Open && block.timestamp <= order.expiry;
    }

    function _open(uint256 id) private view returns (Order storage order) {
        order = _orders[id];
        if (order.status == Status.None) revert UnknownOrder(id);
        if (order.status != Status.Open) revert OrderNotOpen(id);
    }

    /// @dev Takes `amount` of `token` from the caller and delivers it to `to`: ETH must arrive with the call,
    ///      a token is pulled with the caller's approval.
    function _collect(address token, address from, address to, uint256 amount) private {
        if (token == address(0)) {
            if (msg.value != amount) revert WrongValue(amount, msg.value);
            if (to != address(this)) _send(address(0), to, amount);
        } else {
            if (msg.value != 0) revert WrongValue(0, msg.value);
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    function _send(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
