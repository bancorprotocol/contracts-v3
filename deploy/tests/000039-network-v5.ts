import { BancorNetwork } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let network: BancorNetwork;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
    });

    it('should deploy and migrate the new pool collection contract and related contracts', async () => {
        expect(await network.version()).to.equal(4);
    });
});
