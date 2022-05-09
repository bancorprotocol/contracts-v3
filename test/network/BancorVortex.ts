import Contracts, {
    BancorVortex,
    IERC20,
    MasterVault,
    NetworkSettings,
    TestBancorNetwork,
    TestPoolCollection
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { toPPM, toWei } from '../../utils/Types';
import { Roles } from '../helpers/AccessControl';
import { createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('BancorVortex', () => {
    let bancorVortex: BancorVortex;
    let network: TestBancorNetwork;
    let bnt: IERC20;
    let vbnt: IERC20;
    let vbntGovernance: TokenGovernance;
    let poolCollection: TestPoolCollection;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('BancorVortex', '_vortexRewards');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ bancorVortex, network, bnt, vbnt, vbntGovernance, poolCollection, networkSettings, masterVault } =
            await createSystem());
    });

    describe('construction', () => {
        it('should revert when attempting to create with an invalid Bancor Network contract', async () => {
            await expect(
                Contracts.BancorVortex.deploy(ZERO_ADDRESS, bnt.address, vbntGovernance.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT contract', async () => {
            await expect(
                Contracts.BancorVortex.deploy(network.address, ZERO_ADDRESS, vbntGovernance.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT Governance contract', async () => {
            await expect(Contracts.BancorVortex.deploy(network.address, bnt.address, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(bancorVortex.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await bancorVortex.version()).to.equal(1);

            const vortexRewards = await bancorVortex.vortexRewards();
            expect(vortexRewards.burnRewardPPM).to.equal(0);
            expect(vortexRewards.burnRewardMaxAmount).to.equal(0);
        });
    });

    describe('vortex rewards', () => {
        const newVortexRewards = {
            burnRewardPPM: toPPM(10),
            burnRewardMaxAmount: toWei(100)
        };

        it('should revert when a non-admin attempts to set the vortex settings', async () => {
            await expect(bancorVortex.connect(nonOwner).setVortexRewards(newVortexRewards)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when setting the vortex settings to an invalid value', async () => {
            await expect(
                bancorVortex.setVortexRewards({
                    burnRewardPPM: PPM_RESOLUTION + 1,
                    burnRewardMaxAmount: toWei(100)
                })
            ).to.be.revertedWith('InvalidFee');

            await expect(
                bancorVortex.setVortexRewards({
                    burnRewardPPM: toPPM(10),
                    burnRewardMaxAmount: 0
                })
            ).to.be.revertedWith('ZeroValue');
        });

        it('should ignore updating to the same vortex settings', async () => {
            await bancorVortex.setVortexRewards(newVortexRewards);

            const res = await bancorVortex.setVortexRewards(newVortexRewards);
            await expect(res).not.to.emit(bancorVortex, 'VortexBurnRewardUpdated');
        });

        it('should be able to set and update the vortex settings', async () => {
            const res = await bancorVortex.setVortexRewards(newVortexRewards);
            await expect(res)
                .to.emit(bancorVortex, 'VortexBurnRewardUpdated')
                .withArgs(0, newVortexRewards.burnRewardPPM, 0, newVortexRewards.burnRewardMaxAmount);

            const vortexRewards = await bancorVortex.vortexRewards();
            expect(vortexRewards.burnRewardPPM).to.equal(newVortexRewards.burnRewardPPM);
            expect(vortexRewards.burnRewardMaxAmount).to.equal(newVortexRewards.burnRewardMaxAmount);
        });
    });

    describe('vortex execution', () => {
        it('should revert if the network fee manager role has not been granted to this contract', async () => {
            await expect(bancorVortex.execute()).to.be.revertedWith('AccessDenied');
        });

        context('successful execution', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(vbnt.address);
                await network.addPoolCollection(poolCollection.address);
                await network.createPool(await poolCollection.poolType(), vbnt.address);
                await network.grantRole(Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER, bancorVortex.address);
                await poolCollection.setDepositLimit(vbnt.address, MAX_UINT256);
                const tradingLiquidity = toWei(1_000_000);
                await vbnt.approve(network.address, tradingLiquidity);
                await network.deposit(vbnt.address, tradingLiquidity);
                await poolCollection.setTradingLiquidityT(vbnt.address, {
                    bntTradingLiquidity: tradingLiquidity,
                    baseTokenTradingLiquidity: tradingLiquidity,
                    stakedBalance: tradingLiquidity
                });
                await poolCollection.enableTrading(vbnt.address, tradingLiquidity, tradingLiquidity);
            });

            for (const burnReward of [1, 5, 10]) {
                for (const burnRewardMaxAmount of [1, 1000, 1_000_000]) {
                    for (const pendingNetworkFeeAmount of [1, 1000, 1_000_000]) {
                        it.only(`burnReward = ${burnReward}%, burnRewardMaxAmount = ${burnRewardMaxAmount}, pendingNetworkFeeAmount = ${pendingNetworkFeeAmount}`, async () => {
                            await bnt.transfer(masterVault.address, toWei(pendingNetworkFeeAmount));
                            await network.setPendingNetworkFeeAmountT(toWei(pendingNetworkFeeAmount));
                            await bancorVortex.setVortexRewards({
                                burnRewardPPM: toPPM(burnReward),
                                burnRewardMaxAmount: toWei(burnRewardMaxAmount)
                            });
                            await bancorVortex.execute();
                        });
                    }
                }
            }
        });
    });
});
