import { zeroAddress, type Address } from 'viem';

import { classifyBadgeTransfer, classifyTokenTransfer } from '../activity';

const me = '0x8C9e48689422bDA40e80cCA9ca5153612B6ad81c' as Address;
const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const tx = '0xAAAA000000000000000000000000000000000000000000000000000000000001' as const;

describe('classifyTokenTransfer', () => {
  it('tells sent from received, with the other wallet as counterparty', () => {
    expect(classifyTokenTransfer({ from: me, to: bob, txHash: tx }, me, new Set())).toEqual({ kind: 'chat-sent', counterparty: bob });
    expect(classifyTokenTransfer({ from: bob, to: me.toLowerCase() as Address, txHash: tx }, me, new Set())).toEqual({ kind: 'chat-received', counterparty: bob });
  });

  it('tells a faucet claim from an admin mint', () => {
    expect(classifyTokenTransfer({ from: zeroAddress, to: me, txHash: tx }, me, new Set([tx.toLowerCase()]))).toEqual({ kind: 'chat-faucet' });
    expect(classifyTokenTransfer({ from: zeroAddress, to: me, txHash: tx }, me, new Set())).toEqual({ kind: 'chat-minted' });
  });
});

describe('classifyBadgeTransfer', () => {
  it('covers minted, received and sent', () => {
    expect(classifyBadgeTransfer({ from: zeroAddress, to: me }, me)).toEqual({ kind: 'badge-minted' });
    expect(classifyBadgeTransfer({ from: bob, to: me }, me)).toEqual({ kind: 'badge-received', counterparty: bob });
    expect(classifyBadgeTransfer({ from: me, to: bob }, me)).toEqual({ kind: 'badge-sent', counterparty: bob });
  });
});
