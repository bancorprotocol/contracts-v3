import { ContractInstance, DeployedContracts, isTenderlyFork } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { toWei } from '../utils/Types';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { ethers, getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { deployer: deployerAddress, ethWhale: ethWhaleAddress } = await getNamedAccounts();
    const deployer = await ethers.getSigner(deployerAddress);
    const ethWhale = await ethers.getSigner(ethWhaleAddress);

    const bntTokenGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntTokenGovernance = await DeployedContracts.VBNTGovernance.deployed();

    await bntTokenGovernance.connect(deployer).grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);
    await vbntTokenGovernance.connect(deployer).grantRole(Roles.TokenGovernance.ROLE_MINTER, deployer.address);

    for (const account of [
        '0xC030109bE8960f938Cf141F2E752D69960C785E4',
        '0x5f7a009664B771E889751f4FD721aDc439033ECD',
        '0x154453e6382C5E166f9d79d2708523EBB483C8f1'
    ]) {
        await ethWhale.sendTransaction({
            value: toWei(1000),
            to: account
        });

        await bntTokenGovernance.connect(deployer).mint(account, toWei(1000));
        await vbntTokenGovernance.connect(deployer).mint(account, toWei(1000));

        for (const contractName of [
            ContractInstance.TestToken1,
            ContractInstance.TestToken2,
            ContractInstance.TestToken3,
            ContractInstance.TestToken4,
            ContractInstance.TestToken5
        ]) {
            const testToken = await DeployedContracts[contractName].deployed();

            await testToken.connect(deployer).transfer(account, toWei(1000));
        }
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
