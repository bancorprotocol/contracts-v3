import { PoolToken } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682500-bnt-pool-token', DeploymentTag.BNTPoolTokenV1, () => {
    let deployer: string;
    let bnt: BNT;
    let bntPoolToken: PoolToken;
    const bntPoolTokenData = new TokenData(TokenSymbol.bnBNT);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bntPoolToken = await DeployedContracts.BNTPoolToken.deployed();
    });

    it('should deploy and configure the BNT pool contract', async () => {
        expect(await bntPoolToken.version()).to.equal(1);

        expect(await bntPoolToken.owner()).to.equal(deployer);

        expect(await bntPoolToken.name()).to.equal(bntPoolTokenData.name());
        expect(await bntPoolToken.symbol()).to.equal(bntPoolTokenData.symbol());
        expect(await bntPoolToken.decimals()).to.equal(bntPoolTokenData.decimals());
        expect(await bntPoolToken.totalSupply()).to.equal(0);
        expect(await bntPoolToken.reserveToken()).to.equal(bnt.address);
    });
});
