import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm';
import { TESTNET, address, hash, quantity, error } from './testnet-rpc.mjs';

export const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export class WdkReadOnlyVerifier {
  #rpc; #account; #recipient;
  constructor({rpc,recipient}){
    this.#recipient=address(recipient);this.#rpc=rpc;
    // Composition exposes no signing account, manager, provider URL or write method to the HTTP client.
    this.#account=new WalletAccountReadOnlyEvm(this.#recipient,{provider:{request:args=>this.#request(args)}});
  }
  async #request(args){
    const allowed=['eth_chainId','eth_blockNumber','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getBlockByNumber'];
    if(!allowed.includes(args.method))throw error('RPC_WRITE_DENIED','Scriere RPC interzisă.');
    return this.#rpc.request(args);
  }
  async #call(method,params=[]){return this.#request({method,params});}
  async profile(){
    try{
      if(quantity(await this.#call('eth_chainId'))!==BigInt(TESTNET.chainId))throw error('CHAIN','Rețeaua RPC nu este Sepolia. Citirea este oprită.');
      const code=await this.#call('eth_getCode',[TESTNET.token,'latest']);
      if(typeof code!=='string'||!/^0x[0-9a-f]+$/i.test(code)||code==='0x0')throw error('TOKEN','Contractul de test nu are cod verificabil.');
      const decimals=await this.#call('eth_call',[{to:TESTNET.token,data:'0x313ce567'},'latest']);
      if(typeof decimals!=='string'||!/^0x[0-9a-f]{64}$/i.test(decimals)||BigInt(decimals)!==6n)throw error('DECIMALS','Contractul nu are cele 6 zecimale așteptate.');
      const wdkAddress=await this.#account.getAddress();
      if(address(wdkAddress)!==this.#recipient)throw error('WDK_ADDRESS','Adresa WDK nu corespunde.');
      const balance=await this.#account.getTokenBalance(TESTNET.token);
      if(typeof balance!=='bigint'||balance<0n)throw error('WDK_BALANCE','Sold WDK invalid.');
      return {...TESTNET,recipient:this.#recipient,wdkVersion:'1.0.0-beta.20',wdkAddress,balanceUnits:balance.toString(),readOnly:true};
    }catch(problem){
      if(['CHAIN','TOKEN','DECIMALS','WDK_ADDRESS','WDK_BALANCE'].includes(problem.code))throw problem;
      throw error('RPC_UNAVAILABLE','Verificarea WDK/RPC a eșuat. Endpointul și cheile sunt ascunse.');
    }
  }
  async inspect(transactionHash){
    const tx=hash(transactionHash);const profile=await this.profile();
    try{
      const receipt=await this.#call('eth_getTransactionReceipt',[tx]);
      if(receipt===null)return {transactionHash:tx,profile,state:'missing',events:[]};
      if(hash(receipt.transactionHash)!==tx)throw error('RPC_DATA','Receipt pentru altă tranzacție.');
      const status=quantity(receipt.status);
      if(status!==0n&&status!==1n)throw error('RPC_DATA','Status receipt invalid.');
      if(status===0n)return {transactionHash:tx,profile,state:'failed',events:[]};
      const blockNumber=quantity(receipt.blockNumber);const blockHash=hash(receipt.blockHash);
      const block=await this.#call('eth_getBlockByNumber',[receipt.blockNumber,false]);
      if(!block||hash(block.hash)!==blockHash)return {transactionHash:tx,profile,state:'reorganized',events:[]};
      if(quantity(block.number)!==blockNumber)throw error('RPC_DATA','Bloc inconsistent.');
      const timestamp=quantity(block.timestamp);
      if(timestamp>253402300799n)throw error('RPC_DATA','Timestamp invalid.');
      const head=quantity(await this.#call('eth_blockNumber'));
      if(head<blockNumber)return {transactionHash:tx,profile,state:'reorganized',events:[]};
      const confirmations=head-blockNumber+1n;
      if(confirmations>BigInt(Number.MAX_SAFE_INTEGER))throw error('RPC_DATA','Confirmări invalide.');
      if(!Array.isArray(receipt.logs)||receipt.logs.length>2000)throw error('RPC_DATA','Loguri invalide.');
      const seen=new Set();const events=[];
      for(const log of receipt.logs){
        if(address(log.address)!==TESTNET.token)continue;
        if(!Array.isArray(log.topics)||log.topics[0]?.toLowerCase()!==TRANSFER_TOPIC)continue;
        if(log.removed===true)continue;
        if(log.topics.length!==3||log.topics.slice(1).some(topic=>typeof topic!=='string'||!/^0x0{24}[0-9a-f]{40}$/i.test(topic))||typeof log.data!=='string'||!/^0x[0-9a-f]{64}$/i.test(log.data)||hash(log.transactionHash)!==tx||hash(log.blockHash)!==blockHash||quantity(log.blockNumber)!==blockNumber)throw error('RPC_DATA','Eveniment Transfer invalid.');
        const logIndex=quantity(log.logIndex);
        if(logIndex>1000000n||seen.has(logIndex.toString()))throw error('RPC_DATA','LogIndex invalid sau duplicat.');
        seen.add(logIndex.toString());
        const recipient=address('0x'+log.topics[2].slice(-40));
        if(recipient!==this.#recipient)continue;
        const amount=BigInt(log.data);if(amount===0n)continue;
        events.push({key:`${TESTNET.chainId}:${tx}:${logIndex}`,transactionHash:tx,logIndex:Number(logIndex),amountUnits:amount.toString(),recipient,token:TESTNET.token,chainId:TESTNET.chainId,blockNumber:blockNumber.toString(),blockHash,blockTimestamp:new Date(Number(timestamp)*1000).toISOString(),confirmations:Number(confirmations)});
      }
      // Re-read the canonical anchor after collecting logs: a moving chain fails closed.
      const anchor=await this.#call('eth_getBlockByNumber',[receipt.blockNumber,false]);
      if(!anchor||hash(anchor.hash)!==blockHash||quantity(anchor.timestamp)!==timestamp)return {transactionHash:tx,profile,state:'reorganized',events:[]};
      return {transactionHash:tx,profile,state:'canonical',events};
    }catch(problem){
      if(problem.code==='RPC_DATA')throw problem;
      throw error('RPC_UNAVAILABLE','Receipt-ul nu a putut fi verificat. Endpointul și cheile sunt ascunse.');
    }
  }
}
