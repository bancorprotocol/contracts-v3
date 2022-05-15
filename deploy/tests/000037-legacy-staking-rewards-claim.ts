import { AccessControlEnumerable, BancorNetworkInfo, PoolToken } from '../../components/Contracts';
import { BNT, StakingRewardsClaim } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { merkleRoot } from '../scripts/000037-legacy-staking-rewards-claim';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import MerkleTree from 'merkletreejs';

const {
    utils: { getAddress, solidityKeccak256, keccak256 }
} = ethers;

interface Reward {
    claimable: string;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshot: Record<string, Reward> = require('@bancor/contracts-solidity/snapshot/snapshot.json');

describeDeployment(__filename, () => {
    let bnt: BNT;
    let bnBNT: PoolToken;
    let networkInfo: BancorNetworkInfo;
    let stakingRewardsClaim: StakingRewardsClaim;

    const generateLeaf = (address: string, amount: string) =>
        Buffer.from(solidityKeccak256(['address', 'uint256'], [getAddress(address), amount]).slice(2), 'hex');

    const merkleTree = new MerkleTree(
        Object.entries(snapshot).map(([provider, { claimable }]) => generateLeaf(provider, claimable)),
        keccak256,
        { sortPairs: true }
    );

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bnBNT = await DeployedContracts.bnBNT.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        stakingRewardsClaim = await DeployedContracts.StakingRewardsClaim.deployed();
    });

    it('should deploy the legacy staking rewards claim contract', async () => {
        expect(await stakingRewardsClaim.merkleRoot()).to.equal(merkleRoot);

        const standardRewards = await DeployedContracts.StandardRewards.deployed();
        const bntPool = await DeployedContracts.BNTPool.deployed();
        const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();

        const expectedRoles = isMainnet()
            ? [standardRewards.address, bntPool.address, liquidityProtection.address, stakingRewardsClaim.address]
            : [standardRewards.address, bntPool.address];
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            expectedRoles
        );
    });

    const testClaim = (stake: boolean, providerIndices: [number, number]) => {
        it(`should allow ${stake ? 'staking' : 'claiming'} legacy staking rewards`, async () => {
            const sampleProviders = Object.fromEntries(Object.entries(snapshot).slice(...providerIndices));

            for (const [provider, { claimable: amount }] of Object.entries(sampleProviders)) {
                if (BigNumber.from(amount).isZero()) {
                    continue;
                }

                const signer = await ethers.getSigner(provider);
                const proof = merkleTree.getHexProof(generateLeaf(provider, amount));

                const prevBNTTotalSupply = await bnt.totalSupply();
                const prevBNTBalance = await bnt.balanceOf(provider);
                const prevBNBNTBalance = await bnBNT.balanceOf(provider);

                const poolTokenAmount = await networkInfo.underlyingToPoolToken(bnt.address, amount);

                const method = stake
                    ? stakingRewardsClaim.connect(signer).stakeRewards
                    : stakingRewardsClaim.connect(signer).claimRewards;
                await method(provider, amount, proof);

                const currBNTTotalSupply = await bnt.totalSupply();
                const currBNTBalance = await bnt.balanceOf(provider);
                const currBNBNTBalance = await bnBNT.balanceOf(provider);

                if (stake) {
                    expect(currBNTTotalSupply).to.equal(prevBNTTotalSupply);
                    expect(currBNTBalance).to.equal(prevBNTBalance);
                    expect(currBNBNTBalance).to.equal(prevBNBNTBalance.add(poolTokenAmount));
                } else {
                    expect(currBNTTotalSupply).to.equal(prevBNTTotalSupply.add(amount));
                    expect(currBNTBalance).to.equal(prevBNTBalance.add(amount));
                    expect(currBNBNTBalance).to.equal(prevBNBNTBalance);
                }
            }
        });
    };

    testClaim(false, [0, 30]);
    testClaim(true, [100, 30]);
});
