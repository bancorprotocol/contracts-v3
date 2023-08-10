import { BancorNetwork } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let network: BancorNetwork;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
    });

    it('should upgrade the network contract properly', async () => {
        expect(await network.version()).to.equal(9);
        expect(await network.polRewardsPPM()).to.equal(2000);
    });
});
