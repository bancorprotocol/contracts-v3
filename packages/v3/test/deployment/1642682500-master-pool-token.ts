import { PoolToken } from '../../components/Contracts';
import { NetworkToken } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682500-master-pool-token', ContractName.MasterPoolTokenV1, () => {
    let deployer: string;
    let networkToken: NetworkToken;
    let masterPoolToken: PoolToken;
    const masterPoolTokenData = new TokenData(TokenSymbol.bnBNT);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        networkToken = await DeployedContracts.NetworkToken.deployed();
        masterPoolToken = await DeployedContracts.MasterPoolTokenV1.deployed();
    });

    it('should deploy and configure the master pool contract', async () => {
        expect(await masterPoolToken.version()).to.equal(1);

        expect(await masterPoolToken.owner()).to.equal(deployer);

        expect(await masterPoolToken.name()).to.equal(masterPoolTokenData.name());
        expect(await masterPoolToken.symbol()).to.equal(masterPoolTokenData.symbol());
        expect(await masterPoolToken.decimals()).to.equal(masterPoolTokenData.decimals());
        expect(await masterPoolToken.totalSupply()).to.equal(0);
        expect(await masterPoolToken.reserveToken()).to.equal(networkToken.address);
    });
});
