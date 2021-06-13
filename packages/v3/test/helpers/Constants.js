const { BigNumber, ethers } = require('ethers');

module.exports = {
    NATIVE_TOKEN_ADDRESS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    MAX_UINT256: BigNumber.from(2).pow(BigNumber.from(256)).sub(BigNumber.from(1)),
    ZERO_ADDRESS: ethers.constants.AddressZero
};
