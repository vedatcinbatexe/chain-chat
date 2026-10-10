// Registers the demo users (@alice, @bob, @carol) in the Registry contract on the local Anvil chain, so the phone
// has someone to search for and chat with. Safe to run again: users that are already registered are skipped.
// Usage: node scripts/demo/seed-users.mjs
import { DEMO_USERS, RPC, anvil, chain, demoUser, deployment, registryAbi, resolveUser, viem } from './common.mjs';

for (const name of DEMO_USERS) {
  const user = demoUser(name);
  const existing = await resolveUser(user.account.address);
  if (existing.username) {
    console.log(`@${existing.username} is already registered (${user.account.address})`);
    continue;
  }
  const wallet = viem.createWalletClient({ account: user.account, chain: anvil, transport: viem.http(RPC) });
  const hash = await wallet.writeContract({ address: deployment.Registry.address, abi: registryAbi, functionName: 'register', args: [name, viem.bytesToHex(user.encPublic)] });
  const receipt = await chain.waitForTransactionReceipt({ hash });
  console.log(`registered @${name} (${user.account.address}) in block ${receipt.blockNumber}`);
}
