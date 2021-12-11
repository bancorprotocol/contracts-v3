from math import factorial
from decimal import Decimal
from decimal import getcontext
from collections import namedtuple


MAX_PRECISION = 127
EXP_MAX_HI_TERM_VAL = 4 # The input to function 'exp' must be smaller than 2 ^ EXP_MAX_HI_TERM_VAL
EXP_NUM_OF_HI_TERMS = 7 # Compute e ^ 2 ^ n for n = EXP_MAX_HI_TERM_VAL - EXP_NUM_OF_HI_TERMS to EXP_MAX_HI_TERM_VAL


MAX_UINT = (1<<256)-1
ONE = 1<<MAX_PRECISION


def safe(x):
    assert 0 <= x <= MAX_UINT
    return x


def exp(x,hiTerms,loTerms,fixed1):
    res = 0
    z = y = x % hiTerms[0].bit
    for term in loTerms[+1:]:
        z = safe(z*y)//fixed1
        res = safe(res+safe(z*term.val))
    res = safe(safe(res//loTerms[0].val+y)+fixed1)
    for term in hiTerms[:-1]:
        if x & term.bit:
            res = safe(res*term.num)//term.den
    return res


getcontext().prec = 100


HiTerm = namedtuple('HiTerm','bit,num,den')
LoTerm = namedtuple('LoTerm','val,ind')


hiTerms = []
loTerms = []


top = int(Decimal(2**(0+EXP_MAX_HI_TERM_VAL-EXP_NUM_OF_HI_TERMS)).exp()*ONE)-1
for n in range(EXP_NUM_OF_HI_TERMS+1):
    cur = Decimal(2**(n+EXP_MAX_HI_TERM_VAL-EXP_NUM_OF_HI_TERMS)).exp()
    den = int(MAX_UINT/(cur*top))
    num = int(den*cur)
    top = top*num//den
    bit = (ONE<<(n+EXP_MAX_HI_TERM_VAL))>>EXP_NUM_OF_HI_TERMS
    hiTerms.append(HiTerm(bit,num,den))


MAX_VAL = hiTerms[-1].bit-1
loTerms = [LoTerm(1,1)]
res = exp(MAX_VAL,hiTerms,loTerms,ONE)
while True:
    n = len(loTerms)+1
    val = factorial(n)
    loTermsNext = [LoTerm(val//factorial(i+1),i+1) for i in range(n)]
    resNext = exp(MAX_VAL,hiTerms,loTermsNext,ONE)
    if res < resNext:
        res = resNext
        loTerms = loTermsNext
    else:
        break


hiTermBitMaxLen = len(hex(hiTerms[-1].bit))
hiTermNumMaxLen = len(hex(hiTerms[ 0].num))
hiTermDenMaxLen = len(hex(hiTerms[ 0].den))
loTermValMaxLen = len(hex(loTerms[+1].val))
loTermIndMaxLen = len(str(loTerms[-1].ind))


hiTermIndMin    = EXP_MAX_HI_TERM_VAL-EXP_NUM_OF_HI_TERMS
hiTermIndMaxLen = max(len(str(EXP_MAX_HI_TERM_VAL-1)),len(str(EXP_MAX_HI_TERM_VAL-EXP_NUM_OF_HI_TERMS)))


print('')
print('    uint256 internal constant ONE = 1 << {};'.format(MAX_PRECISION))
print('')
print('    function exp(uint256 a, uint256 b) internal pure returns (uint256 n) {')
print('        uint256 x = MathEx.mulDivF(ONE, a, b);')
print('        uint256 y;')
print('        uint256 z;')
print('')
print('        require(x < 0x{:x}, "ExpValueTooHigh");'.format(hiTerms[-1].bit))
print('')
print('        z = y = x % 0x{:x}; // get the input modulo 2^({:+d})'.format(hiTerms[0].bit,EXP_MAX_HI_TERM_VAL-EXP_NUM_OF_HI_TERMS))
for n in range(1,len(loTerms)):
    str1 = '{0:#0{1}x}'.format(loTerms[n].val,loTermValMaxLen)
    str2 = '{0:0{1}d}' .format(loTerms[n].ind,loTermIndMaxLen)
    str3 = '{0:0{1}d}' .format(len(loTerms)  ,loTermIndMaxLen)
    str4 = '{0:0{1}d}' .format(loTerms[n].ind,loTermIndMaxLen)
    print('        z = z * y / ONE; n += z * {}; // add y^{} * ({}! / {}!)'.format(str1,str2,str3,str4))
print('        n = n / 0x{:x} + y + ONE; // divide by {}! and then add y^1 / 1! + y^0 / 0!'.format(loTerms[0].val,len(loTerms)))
print('')
for n in range(len(hiTerms)-1):
    str1 = '{0:#0{1}x}'.format(hiTerms[n].bit,hiTermBitMaxLen)
    str2 = '{0:#0{1}x}'.format(hiTerms[n].num,hiTermNumMaxLen)
    str3 = '{0:#0{1}x}'.format(hiTerms[n].den,hiTermDenMaxLen)
    str4 = '{0:+{1}d}' .format(hiTermIndMin+n,hiTermIndMaxLen)
    print('        if ((x & {}) != 0) n = n * {} / {}; // multiply by e^2^({})'.format(str1,str2,str3,str4))
print('    }')
print('')
