import MathUtils from './MathUtils';
import { MAX_UINT256, PPM_RESOLUTION } from './Constants';

const { Decimal } = MathUtils;
const MAX_VAL = MAX_UINT256.toString();
const PPMR = PPM_RESOLUTION.toNumber();

// c(c - e)^2 / b <= 2^256 - 1
const maxArbComputable = (b: any, c: any, e: any) => {
    [b, c, e] = [b, c, e].map((x) => new Decimal(x));
    return c.mul(c.sub(e).pow(2)).div(b).lte(MAX_VAL);
};

// bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2) >= x
const maxArbCondition = (b: any, c: any, d: any, e: any, n: any, x: any) => {
    [b, c, d, e, n, x] = [b, c, d, e, n, x].map((x) => new Decimal(x));
    return maxArb(b, c, d, e, n).gte(x);
};

// bden(b + c) / (b^3 + b^2(3c - 2e) + b(e^2(n + 1) + c(3c - 4e)) + c(c - e)^2)
const maxArb = (b: any, c: any, d: any, e: any, n: any) => {
    [b, c, d, e, n] = [b, c, d, e, n].map((x) => new Decimal(x));
    n = n.div(PPMR);
    return b
        .mul(d)
        .mul(e)
        .mul(n)
        .mul(b.add(c))
        .div(
            b
                .pow(3)
                .add(b.pow(2).mul(c.mul(3).sub(e.mul(2))))
                .add(
                    b.mul(
                        e
                            .pow(2)
                            .mul(n.add(1))
                            .add(c.mul(c.mul(3).sub(e.mul(4))))
                    )
                )
                .add(c.mul(c.sub(e).pow(2)))
        );
};

// af(b(2 - m) + f) / (b(b + mf))
const optArb = (a: any, b: any, f: any, m: any) => {
    [a, b, f, m] = [a, b, f, m].map((x) => new Decimal(x));
    m = m.div(PPMR);
    return a
        .mul(f)
        .mul(b.mul(new Decimal(2).sub(m)).add(f))
        .div(b.mul(b.add(m.mul(f))))
        .floor();
};

export default {
    Decimal,
    MAX_VAL,
    PPMR,
    maxArbComputable,
    maxArbCondition,
    maxArb,
    optArb
};
