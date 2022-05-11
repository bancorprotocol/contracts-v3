/* Autogenerated file. Do not edit manually. */

/* tslint:disable */

/* eslint-disable */
import type {
  PendingWithdrawals,
  PendingWithdrawalsInterface,
} from "../../../contracts/network/PendingWithdrawalsV1";
import type { Provider, TransactionRequest } from "@ethersproject/providers";
import { Signer, utils, Contract, ContractFactory, Overrides } from "ethers";

const _abi = [
  {
    inputs: [
      {
        internalType: "contract IBancorNetwork",
        name: "initNetwork",
        type: "address",
      },
      {
        internalType: "contract IERC20",
        name: "initBNT",
        type: "address",
      },
      {
        internalType: "contract IBNTPool",
        name: "initBNTPool",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccessDenied",
    type: "error",
  },
  {
    inputs: [],
    name: "AlreadyExists",
    type: "error",
  },
  {
    inputs: [],
    name: "AlreadyInitialized",
    type: "error",
  },
  {
    inputs: [],
    name: "DoesNotExist",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidAddress",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidPool",
    type: "error",
  },
  {
    inputs: [],
    name: "Overflow",
    type: "error",
  },
  {
    inputs: [],
    name: "WithdrawalNotAllowed",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroValue",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint32",
        name: "prevLockDuration",
        type: "uint32",
      },
      {
        indexed: false,
        internalType: "uint32",
        name: "newLockDuration",
        type: "uint32",
      },
    ],
    name: "LockDurationUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "previousAdminRole",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "newAdminRole",
        type: "bytes32",
      },
    ],
    name: "RoleAdminChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleGranted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "RoleRevoked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "contract Token",
        name: "pool",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "requestId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "poolTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "reserveTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint32",
        name: "timeElapsed",
        type: "uint32",
      },
    ],
    name: "WithdrawalCancelled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "contextId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "contract Token",
        name: "pool",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "requestId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "poolTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "reserveTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint32",
        name: "timeElapsed",
        type: "uint32",
      },
    ],
    name: "WithdrawalCompleted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "contract Token",
        name: "pool",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "requestId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "poolTokenAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "reserveTokenAmount",
        type: "uint256",
      },
    ],
    name: "WithdrawalInitiated",
    type: "event",
  },
  {
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "cancelWithdrawal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "contextId",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "completeWithdrawal",
    outputs: [
      {
        components: [
          {
            internalType: "contract IPoolToken",
            name: "poolToken",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "poolTokenAmount",
            type: "uint256",
          },
        ],
        internalType: "struct CompletedWithdrawal",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
    ],
    name: "getRoleAdmin",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "getRoleMember",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
    ],
    name: "getRoleMemberCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "grantRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "hasRole",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "provider",
        type: "address",
      },
      {
        internalType: "contract IPoolToken",
        name: "poolToken",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "poolTokenAmount",
        type: "uint256",
      },
    ],
    name: "initWithdrawal",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "isReadyForWithdrawal",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "lockDuration",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "postUpgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "renounceRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "role",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "revokeRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "roleAdmin",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "newLockDuration",
        type: "uint32",
      },
    ],
    name: "setLockDuration",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "version",
    outputs: [
      {
        internalType: "uint16",
        name: "",
        type: "uint16",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "id",
        type: "uint256",
      },
    ],
    name: "withdrawalRequest",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "provider",
            type: "address",
          },
          {
            internalType: "contract IPoolToken",
            name: "poolToken",
            type: "address",
          },
          {
            internalType: "contract Token",
            name: "reserveToken",
            type: "address",
          },
          {
            internalType: "uint32",
            name: "createdAt",
            type: "uint32",
          },
          {
            internalType: "uint256",
            name: "poolTokenAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "reserveTokenAmount",
            type: "uint256",
          },
        ],
        internalType: "struct WithdrawalRequest",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "provider",
        type: "address",
      },
    ],
    name: "withdrawalRequestCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "provider",
        type: "address",
      },
    ],
    name: "withdrawalRequestIds",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const _bytecode =
  "0x60e06040523480156200001157600080fd5b50604051620024e9380380620024e98339810160408190526200003491620000ba565b82620000408162000079565b826200004c8162000079565b82620000588162000079565b5050506001600160a01b0392831660805290821660a0521660c0526200010e565b6001600160a01b038116620000a15760405163e6c4247b60e01b815260040160405180910390fd5b50565b6001600160a01b0381168114620000a157600080fd5b600080600060608486031215620000d057600080fd5b8351620000dd81620000a4565b6020850151909350620000f081620000a4565b60408501519092506200010381620000a4565b809150509250925092565b60805160a05160c05161238f6200015a6000396000610f6e01526000610f2f0152600081816104b101528181610505015281816109d601528181610c520152611007015261238f6000f3fe608060405234801561001057600080fd5b50600436106101425760003560e01c80638cd2403d116100b8578063ade3142f1161007c578063ade3142f146103d8578063b09233c8146103eb578063be476d8a146103fe578063ca15c87314610411578063d547741f14610424578063ed249d051461043757600080fd5b80638cd2403d1461036b5780639010d07c1461037e57806391d14854146103a957806393867fb5146103bc578063a217fddf146103d057600080fd5b80632b0b23561161010a5780632b0b2356146101eb5780632f2ff15d1461022257806336568abe146102375780635209cb981461024a57806354fd4d50146103545780638129fc1c1461036357600080fd5b806301ffc9a714610147578063045544431461016f5780630aa9e15c14610187578063248a9ca3146101a757806327cfcfa2146101d8575b600080fd5b61015a610155366004611e0a565b61044a565b60405190151581526020015b60405180910390f35b60fb5460405163ffffffff9091168152602001610166565b61019a610195366004611e49565b610475565b6040516101669190611e66565b6101ca6101b5366004611eaa565b60009081526065602052604090206001015490565b604051908152602001610166565b6101ca6101e6366004611ec3565b610499565b6101fe6101f9366004611f04565b6104ef565b6040805182516001600160a01b031681526020928301519281019290925201610166565b610235610230366004611f2b565b610788565b005b610235610245366004611f2b565b6107b3565b6102fa610258366004611eaa565b6040805160c081018252600080825260208201819052918101829052606081018290526080810182905260a081019190915250600090815260fe6020908152604091829020825160c08101845281546001600160a01b0390811682526001830154811693820193909352600282015492831693810193909352600160a01b90910463ffffffff166060830152600381015460808301526004015460a082015290565b6040805182516001600160a01b03908116825260208085015182169083015283830151169181019190915260608083015163ffffffff16908201526080808301519082015260a0918201519181019190915260c001610166565b60405160018152602001610166565b610235610836565b610235610379366004611f5b565b6108f7565b61039161038c366004611fcd565b610948565b6040516001600160a01b039091168152602001610166565b61015a6103b7366004611f2b565b610967565b6000805160206123638339815191526101ca565b6101ca600081565b6101ca6103e6366004611e49565b610992565b6102356103f9366004611fef565b6109b3565b61023561040c366004612015565b6109d4565b6101ca61041f366004611eaa565b610a9e565b610235610432366004611f2b565b610ab5565b61015a610445366004611eaa565b610adb565b60006001600160e01b03198216635a05180f60e01b148061046f575061046f82610b18565b92915050565b6001600160a01b038116600090815260fd6020526040902060609061046f90610b4d565b6000826104a581610b5a565b826104af81610b81565b7f00000000000000000000000000000000000000000000000000000000000000006104d981610ba2565b6104e4878787610bcb565b979650505050505050565b60408051808201909152600080825260208201527f000000000000000000000000000000000000000000000000000000000000000061052d81610ba2565b600083815260fe6020908152604091829020825160c08101845281546001600160a01b039081168083526001840154821694830194909452600283015480821695830195909552600160a01b90940463ffffffff1660608201526003820154608082015260049091015460a0820152918616146105bd57604051634ca8886760e01b815260040160405180910390fd5b60004290506105d0818360600151610e72565b6105ed5760405163209a769d60e11b815260040160405180910390fd5b6105f78686610e9b565b600061060b83604001518460800151610f23565b90508260a0015181101561062157610621612041565b6000818460a00151146106465761064184608001518560a00151846110e5565b61064c565b83608001515b905080846080015111156106ce5783602001516001600160a01b03166342966c6882866080015161067d919061206d565b6040518263ffffffff1660e01b815260040161069b91815260200190565b600060405180830381600087803b1580156106b557600080fd5b505af11580156106c9573d6000803e3d6000fd5b505050505b60208401516106e7906001600160a01b031633836111b1565b876001600160a01b031684604001516001600160a01b03168a7f70a90e1e4f0e226199127e9bd05b3cbf9c2e5df8a2265903456eb0951727a4cc8a85878a606001518a6107349190612084565b6040805194855260208501939093529183015263ffffffff16606082015260800160405180910390a4604080518082019091526020948501516001600160a01b031681529384015250909695505050505050565b6000828152606560205260409020600101546107a48133611203565b6107ae8383611267565b505050565b6001600160a01b03811633146108285760405162461bcd60e51b815260206004820152602f60248201527f416363657373436f6e74726f6c3a2063616e206f6e6c792072656e6f756e636560448201526e103937b632b9903337b91039b2b63360891b60648201526084015b60405180910390fd5b6108328282611289565b5050565b600054610100900460ff166108515760005460ff1615610855565b303b155b6108b85760405162461bcd60e51b815260206004820152602e60248201527f496e697469616c697a61626c653a20636f6e747261637420697320616c72656160448201526d191e481a5b9a5d1a585b1a5e995960921b606482015260840161081f565b600054610100900460ff161580156108da576000805461ffff19166101011790555b6108e26112ab565b80156108f4576000805461ff00191690555b50565b60c95460009061090c9061ffff1660016120a9565b905061ffff81166001146109325760405162dc149f60e41b815260040160405180910390fd5b60c9805461ffff191661ffff8316179055505050565b600082815260976020526040812061096090836112e4565b9392505050565b60009182526065602090815260408084206001600160a01b0393909316845291905290205460ff1690565b6001600160a01b038116600090815260fd6020526040812061046f906112f0565b6109cb600080516020612363833981519152336112fa565b6108f481611321565b7f00000000000000000000000000000000000000000000000000000000000000006109fe81610ba2565b600082815260fe6020908152604091829020825160c08101845281546001600160a01b039081168083526001840154821694830194909452600283015480821695830195909552600160a01b90940463ffffffff1660608201526003820154608082015260049091015460a082015291851614610a8e57604051634ca8886760e01b815260040160405180910390fd5b610a988184611392565b50505050565b600081815260976020526040812061046f906112f0565b600082815260656020526040902060010154610ad18133611203565b6107ae8383611289565b600081815260fe6020526040812080546001600160a01b0316158015906109605750610960426002830154600160a01b900463ffffffff16610e72565b60006001600160e01b03198216637965db0b60e01b148061046f57506301ffc9a760e01b6001600160e01b031983161461046f565b6060600061096083611445565b6001600160a01b0381166108f45760405163e6c4247b60e01b815260040160405180910390fd5b806000036108f457604051637c946ed760e01b815260040160405180910390fd5b336001600160a01b038216146108f457604051634ca8886760e01b815260040160405180910390fd5b600080836001600160a01b031663f4325d676040518163ffffffff1660e01b8152600401602060405180830381865afa158015610c0c573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610c3091906120cf565b60405163f6c5786160e01b81526001600160a01b0380831660048301529192507f00000000000000000000000000000000000000000000000000000000000000009091169063f6c5786190602401602060405180830381865afa158015610c9b573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610cbf91906120ec565b610cdb5760405162820f3560e61b815260040160405180910390fd5b60fc805460009182610cec8361210e565b9190505590506000610cfe8386610f23565b90506040518060c00160405280886001600160a01b03168152602001876001600160a01b03168152602001846001600160a01b03168152602001610d3f4290565b63ffffffff908116825260208083018990526040928301859052600086815260fe8252838120855181546001600160a01b039182166001600160a01b031991821617835587850151600184018054918416919092161790558686015160028301805460608a01518816600160a01b026001600160c01b0319909116928416929092179190911790556080870151600383015560a090960151600490910155938b16845260fd90529120610df49184906114a116565b610e115760405163119b4fd360e11b815260040160405180910390fd5b81876001600160a01b0316846001600160a01b03167fd9fbd8fe4451ae979e36c7923543e61b94e26b6f1510866805ee90023a61aa218885604051610e60929190918252602082015260400190565b60405180910390a45095945050505050565b60fb5460009063ffffffff80851691610e8c911684612127565b63ffffffff1611159392505050565b6001600160a01b038216600090815260fd60205260409020610ebd90826114ad565b610eda5760405163b0ce759160e01b815260040160405180910390fd5b600090815260fe6020526040812080546001600160a01b0319908116825560018201805490911690556002810180546001600160c01b0319169055600381018290556004015550565b60006001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000811690841603610fe8576040516303c5513160e21b8152600481018390527f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031690630f1544c490602401602060405180830381865afa158015610fbd573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610fe19190612146565b905061046f565b6040516309bca0e760e41b81526001600160a01b0384811660048301527f00000000000000000000000000000000000000000000000000000000000000001690639bca0e7090602401602060405180830381865afa15801561104e573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061107291906120cf565b604051634ceea75360e01b81526001600160a01b038581166004830152602482018590529190911690634ceea75390604401602060405180830381865afa1580156110c1573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906109609190612146565b6000806110f285856114b9565b80519091506000036111165782816020015161110e9190612175565b915050610960565b8051831161113757604051631a93c68960e11b815260040160405180910390fd5b6000611144868686611540565b90506000611152838361155b565b80519091506000036111785784816020015161116e9190612175565b9350505050610960565b600085810386169061118a83836115e0565b905060006111a061119b848a612175565b611617565b919091029998505050505050505050565b604080516001600160a01b038416602482015260448082018490528251808303909101815260649091019091526020810180516001600160e01b031663a9059cbb60e01b1790526107ae908490611649565b61120d8282610967565b61083257611225816001600160a01b0316601461171b565b61123083602061171b565b6040516020016112419291906121c3565b60408051601f198184030181529082905262461bcd60e51b825261081f91600401612238565b61127182826118b7565b60008281526097602052604090206107ae908261193d565b6112938282611952565b60008281526097602052604090206107ae90826119b9565b600054610100900460ff166112d25760405162461bcd60e51b815260040161081f9061226b565b6112da6119ce565b6112e2611a05565b565b60006109608383611a38565b600061046f825490565b6113048282610967565b61083257604051634ca8886760e01b815260040160405180910390fd5b60fb5463ffffffff9081169082168103611339575050565b60fb805463ffffffff191663ffffffff84811691821790925560408051928416835260208301919091527f416ace8e54446e11e0fc1628f84d8eb835ff3dbf3cdf1dec29135a4d1cb73296910160405180910390a15050565b815161139e9082610e9b565b8151608083015160208401516113bf926001600160a01b03909116916111b1565b8082600001516001600160a01b031683604001516001600160a01b03167f09cf8000f644f8fe85b5fa4e034c4611d089888d0760698d80e34e5a44354aa185608001518660a0015187606001516114134290565b61141d9190612084565b60408051938452602084019290925263ffffffff169082015260600160405180910390a45050565b60608160000180548060200260200160405190810160405280929190818152602001828054801561149557602002820191906000526020600020905b815481526020019060010190808311611481575b50505050509050919050565b60006109608383611a62565b60006109608383611ab1565b604080518082019091526000808252602082015260006114d98484611ba4565b905083830280821061150e57604051806040016040528082846114fc919061206d565b8152602001828152509250505061046f565b604051806040016040528060016115258585900390565b61152f919061206d565b815260200191909152949350505050565b600081806115505761155061215f565b838509949350505050565b6040805180820190915260008082526020820152818360200151106115a85760405180604001604052808460000151815260200183856020015161159f919061206d565b9052905061046f565b6040518060400160405280600185600001516115c4919061206d565b81526020016115d7856020015185900390565b90529392505050565b6000806115f86115f284808403612175565b60010190565b905082846020015161160a9190612175565b8451820217949350505050565b60006001815b600881101561164257838202600203820291508061163a8161210e565b91505061161d565b5092915050565b600061169e826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c6564815250856001600160a01b0316611bb39092919063ffffffff16565b8051909150156107ae57808060200190518101906116bc91906120ec565b6107ae5760405162461bcd60e51b815260206004820152602a60248201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e6044820152691bdd081cdd58d8d9595960b21b606482015260840161081f565b6060600061172a8360026122b6565b6117359060026122d5565b67ffffffffffffffff81111561174d5761174d6122ed565b6040519080825280601f01601f191660200182016040528015611777576020820181803683370190505b509050600360fc1b8160008151811061179257611792612303565b60200101906001600160f81b031916908160001a905350600f60fb1b816001815181106117c1576117c1612303565b60200101906001600160f81b031916908160001a90535060006117e58460026122b6565b6117f09060016122d5565b90505b6001811115611868576f181899199a1a9b1b9c1cb0b131b232b360811b85600f166010811061182457611824612303565b1a60f81b82828151811061183a5761183a612303565b60200101906001600160f81b031916908160001a90535060049490941c9361186181612319565b90506117f3565b5083156109605760405162461bcd60e51b815260206004820181905260248201527f537472696e67733a20686578206c656e67746820696e73756666696369656e74604482015260640161081f565b6118c18282610967565b6108325760008281526065602090815260408083206001600160a01b03851684529091529020805460ff191660011790556118f93390565b6001600160a01b0316816001600160a01b0316837f2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d60405160405180910390a45050565b6000610960836001600160a01b038416611a62565b61195c8282610967565b156108325760008281526065602090815260408083206001600160a01b0385168085529252808320805460ff1916905551339285917ff6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b9190a45050565b6000610960836001600160a01b038416611ab1565b600054610100900460ff166119f55760405162461bcd60e51b815260040161081f9061226b565b6119fd611bca565b6112e2611bf1565b600054610100900460ff16611a2c5760405162461bcd60e51b815260040161081f9061226b565b6112e262093a80611321565b6000826000018281548110611a4f57611a4f612303565b9060005260206000200154905092915050565b6000818152600183016020526040812054611aa95750815460018181018455600084815260208082209093018490558454848252828601909352604090209190915561046f565b50600061046f565b60008181526001830160205260408120548015611b9a576000611ad560018361206d565b8554909150600090611ae99060019061206d565b9050818114611b4e576000866000018281548110611b0957611b09612303565b9060005260206000200154905080876000018481548110611b2c57611b2c612303565b6000918252602080832090910192909255918252600188019052604090208390555b8554869080611b5f57611b5f612330565b60019003818190600052602060002001600090559055856001016000868152602001908152602001600020600090556001935050505061046f565b600091505061046f565b60006000198284099392505050565b6060611bc28484600085611c56565b949350505050565b600054610100900460ff166112e25760405162461bcd60e51b815260040161081f9061226b565b600054610100900460ff16611c185760405162461bcd60e51b815260040161081f9061226b565b60c9805461ffff19166001179055611c3e60008051602061236383398151915280611d7c565b6112e260008051602061236383398151915233611dc7565b606082471015611cb75760405162461bcd60e51b815260206004820152602660248201527f416464726573733a20696e73756666696369656e742062616c616e636520666f6044820152651c8818d85b1b60d21b606482015260840161081f565b6001600160a01b0385163b611d0e5760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604482015260640161081f565b600080866001600160a01b03168587604051611d2a9190612346565b60006040518083038185875af1925050503d8060008114611d67576040519150601f19603f3d011682016040523d82523d6000602084013e611d6c565b606091505b50915091506104e4828286611dd1565b600082815260656020526040808220600101805490849055905190918391839186917fbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff9190a4505050565b6108328282611267565b60608315611de0575081610960565b825115611df05782518084602001fd5b8160405162461bcd60e51b815260040161081f9190612238565b600060208284031215611e1c57600080fd5b81356001600160e01b03198116811461096057600080fd5b6001600160a01b03811681146108f457600080fd5b600060208284031215611e5b57600080fd5b813561096081611e34565b6020808252825182820181905260009190848201906040850190845b81811015611e9e57835183529284019291840191600101611e82565b50909695505050505050565b600060208284031215611ebc57600080fd5b5035919050565b600080600060608486031215611ed857600080fd5b8335611ee381611e34565b92506020840135611ef381611e34565b929592945050506040919091013590565b600080600060608486031215611f1957600080fd5b833592506020840135611ef381611e34565b60008060408385031215611f3e57600080fd5b823591506020830135611f5081611e34565b809150509250929050565b60008060208385031215611f6e57600080fd5b823567ffffffffffffffff80821115611f8657600080fd5b818501915085601f830112611f9a57600080fd5b813581811115611fa957600080fd5b866020828501011115611fbb57600080fd5b60209290920196919550909350505050565b60008060408385031215611fe057600080fd5b50508035926020909101359150565b60006020828403121561200157600080fd5b813563ffffffff8116811461096057600080fd5b6000806040838503121561202857600080fd5b823561203381611e34565b946020939093013593505050565b634e487b7160e01b600052600160045260246000fd5b634e487b7160e01b600052601160045260246000fd5b60008282101561207f5761207f612057565b500390565b600063ffffffff838116908316818110156120a1576120a1612057565b039392505050565b600061ffff8083168185168083038211156120c6576120c6612057565b01949350505050565b6000602082840312156120e157600080fd5b815161096081611e34565b6000602082840312156120fe57600080fd5b8151801515811461096057600080fd5b60006001820161212057612120612057565b5060010190565b600063ffffffff8083168185168083038211156120c6576120c6612057565b60006020828403121561215857600080fd5b5051919050565b634e487b7160e01b600052601260045260246000fd5b60008261219257634e487b7160e01b600052601260045260246000fd5b500490565b60005b838110156121b257818101518382015260200161219a565b83811115610a985750506000910152565b7f416363657373436f6e74726f6c3a206163636f756e74200000000000000000008152600083516121fb816017850160208801612197565b7001034b99036b4b9b9b4b733903937b6329607d1b601791840191820152835161222c816028840160208801612197565b01602801949350505050565b6020815260008251806020840152612257816040850160208701612197565b601f01601f19169190910160400192915050565b6020808252602b908201527f496e697469616c697a61626c653a20636f6e7472616374206973206e6f74206960408201526a6e697469616c697a696e6760a81b606082015260800190565b60008160001904831182151516156122d0576122d0612057565b500290565b600082198211156122e8576122e8612057565b500190565b634e487b7160e01b600052604160045260246000fd5b634e487b7160e01b600052603260045260246000fd5b60008161232857612328612057565b506000190190565b634e487b7160e01b600052603160045260246000fd5b60008251612358818460208701612197565b919091019291505056fe2172861495e7b85edac73e3cd5fbb42dd675baadf627720e687bcfdaca025096a164736f6c634300080d000a";

type PendingWithdrawalsConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: PendingWithdrawalsConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class PendingWithdrawals__factory extends ContractFactory {
  constructor(...args: PendingWithdrawalsConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override deploy(
    initNetwork: string,
    initBNT: string,
    initBNTPool: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<PendingWithdrawals> {
    return super.deploy(
      initNetwork,
      initBNT,
      initBNTPool,
      overrides || {}
    ) as Promise<PendingWithdrawals>;
  }
  override getDeployTransaction(
    initNetwork: string,
    initBNT: string,
    initBNTPool: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): TransactionRequest {
    return super.getDeployTransaction(
      initNetwork,
      initBNT,
      initBNTPool,
      overrides || {}
    );
  }
  override attach(address: string): PendingWithdrawals {
    return super.attach(address) as PendingWithdrawals;
  }
  override connect(signer: Signer): PendingWithdrawals__factory {
    return super.connect(signer) as PendingWithdrawals__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): PendingWithdrawalsInterface {
    return new utils.Interface(_abi) as PendingWithdrawalsInterface;
  }
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): PendingWithdrawals {
    return new Contract(address, _abi, signerOrProvider) as PendingWithdrawals;
  }
}
