const { ethers } = require('hardhat');

const deployContract = async (contractName, ...args) => {
    let signer = (await ethers.getSigners())[0];

    if (typeof args[args.length - 1] === 'object' && args[args.length - 1].from) {
        signer = args[args.length - 1].from;
        if (typeof signer !== 'object' || signer.constructor.name !== 'SignerWithAddress') {
            throw new Error('Signer must be SignerWithAddress');
        }
        args.pop();
    }

    const contractFactory = await ethers.getContractFactory(contractName, signer);
    return args === undefined || args.length === 0 ? await contractFactory.deploy() : contractFactory.deploy(...args);
};

const attachContract = async (contractName, address) => {
    return await ethers.getContractAt(contractName, address);
};

const deployOrAttach = (contractName) => {
    return {
        deploy: (...args) => {
            return deployContract(contractName, ...args);
        },
        attach: (address) => {
            return attachContract(contractName, address);
        }
    };
};

const CONTRACTS = ['Owned', 'TestMathEx', 'TestReserveToken', 'TestSafeERC20Ex', 'TestStandardToken', 'TokenHolder'];

module.exports = Object.fromEntries(CONTRACTS.map((contract) => [contract, deployOrAttach(contract)]));
