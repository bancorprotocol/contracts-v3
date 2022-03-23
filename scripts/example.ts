import { MAX_UINT256, ZERO_ADDRESS } from '../utils/Constants';
import { DeployedContracts, isTenderlyFork } from '../utils/Deploy';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { ethers, getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { deployer: deployerAddress } = await getNamedAccounts();
    const deployer = await ethers.getSigner(deployerAddress);

    const network = await DeployedContracts.BancorNetworkV1.deployed();

    const bnt = await DeployedContracts.BNT.deployed();
    const testToken = await DeployedContracts.TestToken1.deployed();
    const amount = 5000;

    console.log('Previous TKN balance', (await testToken.balanceOf(deployer.address)).toString());
    console.log('Previous BNT balance', (await bnt.balanceOf(deployer.address)).toString());
    console.log();

    await testToken.connect(deployer).approve(network.address, amount);
    const res = await network
        .connect(deployer)
        .tradeBySourceAmount(testToken.address, bnt.address, amount, 1, MAX_UINT256, ZERO_ADDRESS);

    console.log('Transaction Hash', res.hash);

    console.log('Current TKN balance', (await testToken.balanceOf(deployer.address)).toString());
    console.log('Current BNT balance', (await bnt.balanceOf(deployer.address)).toString());
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
