import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DeployedContracts, toDeployTag } from '../../utils/Deploy';
import { toPPM, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682516-set-network-settings', toDeployTag(__filename), () => {
    let networkSettings: NetworkSettingsV1;

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    });

    it('should configure the network settings contract', async () => {
        expect(await networkSettings.minLiquidityForTrading()).to.equal(toWei(10_000));
        expect(await networkSettings.networkFeePPM()).to.equal(toPPM(15));
        expect(await networkSettings.withdrawalFeePPM()).to.equal(toPPM(0.25));
        expect(await networkSettings.flashLoanFeePPM()).to.equal(toPPM(0.09));

        const vortexRewards = await networkSettings.vortexRewards();
        expect(vortexRewards.burnRewardPPM).to.equal(toPPM(10));
        expect(vortexRewards.burnRewardMaxAmount).to.equal(toWei(100));
    });
});
