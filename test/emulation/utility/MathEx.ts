import { BigNumber } from 'ethers';
import { Constants } from './Common';

export const MathEx = {
    mulDivF,
    mulDivC,
    subMax0
};

const ZERO = Constants.ZERO;
const MAX_UINT256 = Constants.MAX_UINT256;

function mulDivF(x: BigNumber, y: BigNumber, z: BigNumber) {
    const res = x.mul(y).div(z);
    if (res.gt(MAX_UINT256)) {
        throw new Error('Overflow');
    }
    return res;
}

function mulDivC(x: BigNumber, y: BigNumber, z: BigNumber) {
    const res = x.mul(y).add(z).sub(1).div(z);
    if (res.gt(MAX_UINT256)) {
        throw new Error('Overflow');
    }
    return res;
}

function subMax0(n1: BigNumber, n2: BigNumber) {
    return n1.gt(n2) ? n1.sub(n2) : ZERO;
}
