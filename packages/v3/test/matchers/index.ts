import supportFraction from './Fraction';

export const customChai = (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) => {
    supportFraction(chai.Assertion, utils);
};
