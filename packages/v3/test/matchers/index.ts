import supportBigNumber from './BigNumber';
import supportFraction from './Fraction';

export const customChai = (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) => {
    supportBigNumber(chai.Assertion, utils);
    supportFraction(chai.Assertion, utils);
};
