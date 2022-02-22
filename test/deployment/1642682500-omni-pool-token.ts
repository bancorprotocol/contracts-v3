import { PoolToken } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682500-omni-pool-token', ContractName.OmniPoolTokenV1, () => {
    let deployer: string;
    let bnt: BNT;
    let omniPoolToken: PoolToken;
    const omniPoolTokenData = new TokenData(TokenSymbol.bnBNT);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        omniPoolToken = await DeployedContracts.OmniPoolTokenV1.deployed();
    });

    it('should deploy and configure the omni pool contract', async () => {
        expect(await omniPoolToken.version()).to.equal(1);

        expect(await omniPoolToken.owner()).to.equal(deployer);

        expect(await omniPoolToken.name()).to.equal(omniPoolTokenData.name());
        expect(await omniPoolToken.symbol()).to.equal(omniPoolTokenData.symbol());
        expect(await omniPoolToken.decimals()).to.equal(omniPoolTokenData.decimals());
        expect(await omniPoolToken.totalSupply()).to.equal(0);
        expect(await omniPoolToken.reserveToken()).to.equal(bnt.address);
    });
});
