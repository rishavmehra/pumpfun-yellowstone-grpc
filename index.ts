import type { ClientDuplexStream } from "@grpc/grpc-js";
import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate, SubscribeUpdateTransaction } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";


const ENDPOINT = Bun.env.ENDPOINT || "";

const TOKEN = Bun.env.TOKEN || ""
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

async function main() {
    const client = new Client(ENDPOINT, TOKEN, {})

    const stream = await client.subscribe();
    const request = createSubscribeRequest();
    await handleStreamEvent(stream)
    try {
        await sendSubscribeRequest(stream, request)
        console.log("bhai connection ban gya with geyser - watching the token");
        
    } catch (error) {
        console.error(`some error in subscription process ${error}`);
        stream.end();
    }
}

const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    instructionDiscriminator: [PUMP_FUN_CREATE_IX_DISCRIMINATOR]
}


function createSubscribeRequest(): SubscribeRequest {
    return {
        accounts:{},
        slots:{},
        transactions: {
            pumpFun: {
                accountInclude: FILTER_CONFIG.programIds,
                accountExclude: [],
                accountRequired:[]
            }
        },
        transactionsStatus:{},
        entry:{},
        blocks:{},
        blocksMeta:{},
        commitment: CommitmentLevel.CONFIRMED,
        accountsDataSlice: [],
        ping: undefined
    }
}

function sendSubscribeRequest(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>, request: SubscribeRequest) {
    return new Promise<void>((resolve, reject)=>{
        stream.write(request, (err: Error | null ) => {
            if (err){
                reject(err)
            }else{
                resolve();
            }
        })
    })
}


function handleStreamEvent(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>): Promise<void> {
    return new Promise<void>((resolve, reject)=>{
        stream.on('data', handleData)

    })
}


function handleData(data: SubscribeUpdate){
    if(!isSubscribeUpdateTransaction(data) || !data.filters.includes('pumpfun')){
        return;
    }

    const transaction = data.transaction?.transaction;
    const msg = transaction?.transaction?.message;
    if (!transaction || !msg){
        return;
    }

    const matchingIx = msg.instructions.find(matchesInstructionDiscriminator);
    if (!matchingIx){
        return
    }

    const formattedSig = convertSignature(transaction.signature)
    const formatteData = formatData(msg, formattedSig.base58, data.transaction.slot);
}

function isSubscribeUpdateTransaction(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
    return (
        'transaction' in data && typeof data.transaction === 'object' && data.transaction !== null  && 'slot' in data.transaction && 'transaction' in data.transaction
    )
}

interface CompiledIx{
    programIdIndex: number,
    accounts: Uint8Array,
    data: Uint8Array
}

function matchesInstructionDiscriminator(ix: CompiledIx): boolean{
    return ix?.data && FILTER_CONFIG.instructionDiscriminator.some(discriminator => {
        Buffer.from(discriminator).equals(ix.data.slice(0,8))
    })
}

function convertSignature(signature: Uint8Array): {base58: string}{
    return {base58: bs58.encode(Buffer.from(signature))}
}

interface Message {
    header: MessageHeader | undefined;
    accountKeys: Uint8Array[];
    recentBlockHash: Uint8Array;
    instructions: CompiledIx[];
    versined: boolean;
    addressTableLookups: MessageAddressTableLookup[];
}

interface MessageAddressTableLookup{
    accountkey: Uint8Array,
    writeableIndexes: Uint8Array,
    readonlyIndexes: Uint8Array
}

interface MessageHeader{
    numRequiredSignature: number,
    numReadonlySignedAccount: number;
    numReadonlyUnsignedAccount: number;
}

interface FormattedTransactionData{
    signature: string,
    slot: string,
    [account: string]: string
}

function formatData(message: Message, sign: String, slot: String)




