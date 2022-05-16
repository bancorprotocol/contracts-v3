import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { toPPM, toWei } from '../../utils/Types';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let networkSettings: NetworkSettingsV1;

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    });

    it('should configure the network settings contract', async () => {
        expect(await networkSettings.minLiquidityForTrading()).to.equal(toWei(10_000));
        expect(await networkSettings.networkFeePPM()).to.equal(toPPM(15));
        expect(await networkSettings.withdrawalFeePPM()).to.equal(toPPM(0.25));
        expect(await networkSettings.flashLoanFeePPM()).to.equal(toPPM(0.09));
    });
});
