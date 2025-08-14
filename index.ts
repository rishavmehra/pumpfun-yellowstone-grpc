import type { ClientDuplexStream } from "@grpc/grpc-js";
import { PublicKey } from "@solana/web3.js";
import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate, SubscribeUpdateTransaction } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";


const ENDPOINT = Bun.env.ENDPOINT || "";
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

async function main(): Promise<void> {
    const client = new Client(ENDPOINT, undefined, {})

    const stream = await client.subscribe();
    const request = createSubscribeRequest();

    try {
        await sendSubscribeRequest(stream, request)
        console.log(JSON.stringify(request));
        console.log("bhai connection ban gya with geyser - watching the token");
        await handleStreamEvent(stream)
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

function sendSubscribeRequest(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>, request: SubscribeRequest): Promise<void> {
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
        
        stream.on('data', handleData);
        
        stream.on("error", (error:Error) => {
            console.error('Stream error: ', error);
            reject(error)
            stream.end();
        });
        stream.on("end", ()=>{
            console.log('Stream ended');
            resolve()
        });
        stream.on("close", ()=>{
            console.log("Stream closed");
            resolve()
        })

    })
}

function handleData(data: SubscribeUpdate): void{
    if(!isSubscribeUpdateTransaction(data) || !data.filters.includes('pumpFun')){
        return;
    }

    const transaction = data.transaction?.transaction;
    const message = transaction?.transaction?.message
    // console.log("First logs here ithe handleData ");
    if (!transaction || !message){
        return;
    }

    const matchingIx = message.instructions.find(matchesInstructionDiscriminator);
    if (!matchingIx){
        return
    }

    const formattedSig = convertSignature(transaction.signature)
    // const formatteData = formatData(message, formattedSig.base58, data.transaction.slot);
    const formatteData = formatData(message, formattedSig.base58, data.transaction.slot);
    if(formatteData) {
        console.log("############ new token minted found ##############");
        console.table(formatteData);
        console.log("\n");
    }
}

// function isSubscribeUpdateTransaction(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
//     return (
//         'transaction' in data && typeof data.transaction === 'object' && data.transaction !== null  && 'slot' in data.transaction && 'transaction' in data.transaction
//     )
// }

function isSubscribeUpdateTransaction(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
    return (
        'transaction' in data && 
        typeof data.transaction === 'object' && 
        data.transaction !== null && 
        'slot' in data.transaction && 
        'transaction' in data.transaction
    )
}


interface CompiledInstruction { // also get from the solana-storage.d.ts
    programIdIndex: number;
    accounts: Uint8Array;
    data: Uint8Array;
}

// function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
//     return ix?.data && FILTER_CONFIG.instructionDiscriminator.some(discriminator => {
//         Buffer.from(discriminator).equals(ix.data.slice(0,8))
//     })
// }
function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
    return ix?.data && FILTER_CONFIG.instructionDiscriminator.some(discriminator => 
        discriminator.equals(ix.data.slice(0,8))
    );
}

function convertSignature(signature: Uint8Array): {base58: string}{
    return {base58: bs58.encode(Buffer.from(signature))}
}

export interface Message { // get from the solana-storage.d.ts
    header: MessageHeader | undefined;
    accountKeys: Uint8Array[];
    recentBlockhash: Uint8Array;
    instructions: CompiledInstruction[];
    versioned: boolean;
    addressTableLookups: MessageAddressTableLookup[];
}

interface MessageAddressTableLookup { // get from the solana-storage.d.ts
    accountKey: Uint8Array;
    writableIndexes: Uint8Array;
    readonlyIndexes: Uint8Array;
}

interface MessageHeader {
    numRequiredSignatures: number;
    numReadonlySignedAccounts: number;
    numReadonlyUnsignedAccounts: number;
}

interface FormattedTransactionData{
    signature: string,
    slot: string,
    [account: string]: string
}

const ACCOUNTS_TO_INCLUDE = [{
    name: "mint",
    index: 0
}];

function formatData(
    message: Message, 
    signature: string, 
    slot: string
): FormattedTransactionData | undefined 
{
    const matchingIx = message.instructions.find(matchesInstructionDiscriminator)

    if (!matchingIx) {
        return undefined;
    }

    const accountKeys = message.accountKeys;
    const includedAccounts = ACCOUNTS_TO_INCLUDE.reduce<Record<string, string>>
    ((acc, { name, index }) => {
        const accountIndex = matchingIx.accounts[index];
        if (accountIndex=== undefined) return acc;
        const pubKey = accountKeys[accountIndex];
        if (pubKey===undefined) return acc;
        acc[name] = new PublicKey(pubKey).toBase58();
        return acc;
    }, {});

    return {
        signature,
        slot,
        ...includedAccounts
    };
}

main().catch((err) => {console.error(err); process.exit(1)});