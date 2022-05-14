import { AccessControlEnumerable, PoolToken } from '../../components/Contracts';
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
    claimable: BigNumber;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshot: Record<string, Reward> = require('@bancor/contracts-solidity/snapshot/snapshot.json');

describeDeployment(__filename, () => {
    let bnt: BNT;
    let bnBNT: PoolToken;
    let stakingRewardsClaim: StakingRewardsClaim;
    let merkleTree: MerkleTree;

    before(async () => {
        merkleTree = new MerkleTree(
            Object.entries(snapshot).map(([provider, { claimable }]) => generateLeaf(provider, claimable)),
            keccak256,
            { sortPairs: true }
        );
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bnBNT = await DeployedContracts.bnBNT.deployed();
        stakingRewardsClaim = await DeployedContracts.StakingRewardsClaim.deployed();
    });

    const generateLeaf = (address: string, amount: BigNumber) =>
        Buffer.from(
            solidityKeccak256(['address', 'uint256'], [getAddress(address), amount.toString()]).slice(2),
            'hex'
        );

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

    const testClaim = (stake: boolean) => {
        it(`should allow ${stake ? 'staking' : 'claiming'} legacy staking rewards`, async () => {
            const sampleProviders = Object.fromEntries(Object.entries(snapshot).slice(0, 5));

            for (const [provider, { claimable: amount }] of Object.entries(sampleProviders)) {
                const signer = await ethers.getSigner(provider);
                const proof = merkleTree.getHexProof(generateLeaf(provider, amount));

                const prevBNTBalance = await bnt.balanceOf(provider);
                const prevBNBNTTotalSupply = await bnBNT.totalSupply();
                const prevBNBNTBalance = await bnBNT.balanceOf(provider);

                const method = stake
                    ? stakingRewardsClaim.connect(signer).stakeRewards
                    : stakingRewardsClaim.connect(signer).claimRewards;
                await method(provider, amount, proof);

                const currBNTBalance = await bnt.balanceOf(provider);
                const currBNBNTTotalSupply = await bnBNT.totalSupply();
                const currBNBNTBalance = await bnBNT.balanceOf(provider);

                if (stake) {
                    expect(currBNTBalance).to.equal(prevBNTBalance);
                    expect(currBNBNTTotalSupply).to.be.gt(prevBNBNTTotalSupply);

                    expect(currBNBNTBalance).to.equal(
                        prevBNBNTBalance.add(currBNBNTTotalSupply.sub(prevBNBNTTotalSupply))
                    );
                } else {
                    expect(currBNTBalance).to.equal(prevBNTBalance.add(amount));
                    expect(currBNBNTTotalSupply).to.equal(prevBNBNTTotalSupply);
                    expect(currBNBNTBalance).to.equal(prevBNBNTBalance);
                }
            }
        });
    };

    for (const stake of [true, false]) {
        testClaim(stake);
    }
});
