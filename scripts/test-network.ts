import Contracts from '../components/Contracts';
import { DeployedContracts, InstanceName, isTenderlyFork } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { ethers, getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';

const TOKENS = {
    [TokenSymbol.TKN1]: InstanceName.TestToken1,
    [TokenSymbol.TKN2]: InstanceName.TestToken2,
    [TokenSymbol.TKN3]: InstanceName.TestToken3,
    [TokenSymbol.TKN4]: InstanceName.TestToken4,
    [TokenSymbol.TKN5]: InstanceName.TestToken5,
    [TokenSymbol.TKN6]: InstanceName.TestToken6,
    [TokenSymbol.TKN7]: InstanceName.TestToken7
};

const DEV_ADDRESSES = [
    '0xC030109bE8960f938Cf141F2E752D69960C785E4',
    '0x5f7a009664B771E889751f4FD721aDc439033ECD',
    '0x154453e6382C5E166f9d79d2708523EBB483C8f1',
    '0x2118234bE2A699410C0A68868A56A237D508aae3',
    '0xF977814e90dA44bFA03b6295A0616a897441aceC',
    '0xE5bD2718783A57276f12f5237E627c3B5dA627a0',
    '0xD9dc2B01ee4b16026F1084F819772Cf9DfF2eE75',
    '0x89bb4ea3AFbb43840e048E63968865A0f4e74dA4'
];

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const {
        deployer: deployerAddress,
        ethWhale: ethWhaleAddress,
        daiWhale: daiWhaleAddress,
        linkWhale: linkWhaleAddress,
        dai: daiAddress,
        link: linkAddress
    } = await getNamedAccounts();
    const deployer = await ethers.getSigner(deployerAddress);
    const ethWhale = await ethers.getSigner(ethWhaleAddress);
    const daiWhale = await ethers.getSigner(daiWhaleAddress);
    const linkWhale = await ethers.getSigner(linkWhaleAddress);

    const bntTokenGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntTokenGovernance = await DeployedContracts.VBNTGovernance.deployed();

    await bntTokenGovernance.connect(deployer).grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);
    await vbntTokenGovernance.connect(deployer).grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);

    for (const account of DEV_ADDRESSES) {
        await ethWhale.sendTransaction({
            value: toWei(1000),
            to: account
        });

        await bntTokenGovernance.connect(deployer).mint(account, toWei(1000));
        await vbntTokenGovernance.connect(deployer).mint(account, toWei(1000));

        for (const [symbol, instanceName] of Object.entries(TOKENS)) {
            const tokenData = new TokenData(symbol as TokenSymbol);
            const testToken = await DeployedContracts[instanceName].deployed();

            await testToken.connect(deployer).transfer(account, toWei(100_000_000, tokenData.decimals()));
        }

        const dai = await Contracts.ERC20.attach(daiAddress);
        await dai.connect(daiWhale).transfer(account, toWei(100_000));

        const link = await Contracts.ERC20.attach(linkAddress);
        await link.connect(linkWhale).transfer(account, toWei(1000));
    }

    await bntTokenGovernance.connect(deployer).revokeRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);
    await vbntTokenGovernance.connect(deployer).revokeRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
