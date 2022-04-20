import { PoolToken } from '../../components/Contracts';
import { BNT } from '../../components/LegacyContracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let bnt: BNT;
    let bnBNT: PoolToken;
    const bnBNTData = new TokenData(TokenSymbol.bnBNT);

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bnBNT = await DeployedContracts.bnBNT.deployed();
    });

    it('should deploy and configure the BNT pool contract', async () => {
        expect(await bnBNT.version()).to.equal(1);

        expect(await bnBNT.owner()).to.equal(deployer);

        expect(await bnBNT.name()).to.equal(bnBNTData.name());
        expect(await bnBNT.symbol()).to.equal(bnBNTData.symbol());
        expect(await bnBNT.decimals()).to.equal(bnBNTData.decimals());
        expect(await bnBNT.totalSupply()).to.equal(0);
        expect(await bnBNT.reserveToken()).to.equal(bnt.address);
    });
});
