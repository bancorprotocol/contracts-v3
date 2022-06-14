import { NetworkSettings } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_FLASH_LOAN_FEE_PPM } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { toPPM, toWei } from '../../utils/Types';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let networkSettings: NetworkSettings;

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
    });

    it('should upgrade and configure the network settings contract', async () => {
        expect(await networkSettings.version()).to.equal(3);

        expect(await networkSettings.withdrawalFeePPM()).to.equal(toPPM(0.25));
        expect(await networkSettings.defaultFlashLoanFeePPM()).to.equal(DEFAULT_FLASH_LOAN_FEE_PPM);

        const vortexRewards = await networkSettings.vortexRewards();
        expect(vortexRewards.burnRewardPPM).to.equal(toPPM(10));
        expect(vortexRewards.burnRewardMaxAmount).to.equal(toWei(100));
    });
});
