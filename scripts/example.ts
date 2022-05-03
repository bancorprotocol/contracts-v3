import Contracts from '../components/Contracts';
import { MAX_UINT256, ZERO_ADDRESS } from '../utils/Constants';
import { DeployedContracts, getNamedSigners, isTenderlyFork } from '../utils/Deploy';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { linkWhale } = await getNamedSigners();
    const { link } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();

    const bnt = await DeployedContracts.BNT.deployed();
    const linkToken = await Contracts.ERC20.attach(link);
    const amount = 5000;

    console.log('Previous LINK balance', (await linkToken.balanceOf(linkWhale.address)).toString());
    console.log('Previous BNT balance', (await bnt.balanceOf(linkWhale.address)).toString());

    console.log();

    await linkToken.connect(linkWhale).approve(network.address, amount);
    const res = await network
        .connect(linkWhale)
        .tradeBySourceAmount(linkToken.address, bnt.address, amount, 1, MAX_UINT256, ZERO_ADDRESS);

    console.log('Transaction Hash', res.hash);
    console.log();

    console.log('Current LINK balance', (await linkToken.balanceOf(linkWhale.address)).toString());
    console.log('Current BNT balance', (await bnt.balanceOf(linkWhale.address)).toString());
    console.log();
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
