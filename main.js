const fabproto6 = require('fabric-protos');
const fabprotos = require('fabric-protos');

var PROTO_PATH = __dirname + '/node_modules/fabric-protos/protos/fabric.proto';
// var PROTO_PATH = __dirname + '/../../fabric-protos/peer/peer.proto';
var path = require('path');
const RPC_PATH = path.join(__dirname, "../../fabric-protos");

// var PROTO_PATH = '/home/jyr/go/src/github.com/hyperledger/fabric-protos/peer/peer.proto';

var grpc = require('grpc');
var protoLoader = require('@grpc/proto-loader');
var fs = require('fs');
let cdata = require('../../caliper-workspace/networks/networkConfig.json');
let certOrigin = require('../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json');

const clientprivkey = cdata["clients"]["Admin@org1.example.com"]["client"]["clientPrivateKey"]["path"]
const clientsignedcert = cdata["clients"]["Admin@org1.example.com"]["client"]["clientSignedCert"]["path"]
const tlsCACerts = cdata["peers"]["peer0.org1.example.com"]["tlsCACerts"]["pem"]
const tlsCACertsOrigin = certOrigin["peers"]["peer0.org1.example.com"]["tlsCACerts"]["pem"]

const credentials = grpc.credentials.createSsl(
    Buffer.from(tlsCACertsOrigin),
    fs.readFileSync(path.join('../', clientprivkey)),
    fs.readFileSync(path.join('../', clientsignedcert)), 
);
// console.log(clientprivkey);
// console.log(clientsignedcert);
// console.log(tlsCACerts);
// process.exit()

// Suggested options for similarity to existing grpc.load behavior
var packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
     longs: String,
     enums: String,
     defaults: true,
     oneofs: true,
    includeDirs: 
        [
            RPC_PATH,
            path.join(RPC_PATH, "peer"),
            path.join(RPC_PATH, "common"),
            path.join(RPC_PATH, "discovery"),
            path.join(RPC_PATH, "gossip"),
            path.join(RPC_PATH, "msp"),
            path.join(RPC_PATH, "ledger"),
            path.join(RPC_PATH, "orderer"),
            path.join(RPC_PATH, "transientstore"),
        ],
    });
var protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
// The protoDescriptor object has the full package hierarchy
var protos = protoDescriptor.protos

// const pembuf = Buffer.from(tlsCACert)
// const clientKeyBuf = Buffer.from(clientKey);
// const clientCertBuf = Buffer.concat([Buffer.from(clientCert), Buffer.from('\0')]);
// this.creds = grpc.credentials.createSsl(pembuf, clientKeyBuf, clientCertBuf);

var client = new protos.Endorser('localhost:7051',credentials);

function buildCurrentTimestamp() {
    const method = `buildCurrentTimestamp[${this.name}]`;
    console.log(`${method} - start`);
    const now = new Date();
    const seconds = parseInt(now.getTime() / 1000);
    const nanos = (now.getTime() % 1000) * 1000000;
    console.log('%s - seconds %s nanos %s', method, seconds, nanos);
    const timestamp = fabproto6.google.protobuf.Timestamp.create({
        seconds: seconds,
        nanos: nanos
    });

    return timestamp;
}                            // grpc.credentials.createInsecure());
// async function buildCurrentTimestamp() {
    // const now = new Date();
    // const timestamp = new fabproto6.google.protobuf.Timestamp();
    // timestamp.setSeconds(now.getTime() / 1000);
    // timestamp.setNanos((now.getTime() % 1000) * 1000000);
    // return timestamp;
// }
async function buildChannelHeader(type, chaincode_id, tx_id) {
    const chaincodeID = fabproto6.protos.ChaincodeID.create(typeof chaincode_id === 'string' ? {
        name: chaincode_id
    } : chaincode_id);

    let fields = {
        chaincode_id: chaincodeID
    };

    let check = fabproto6.protos.ChaincodeHeaderExtension.verify(fields);
    if (check) {
        console.log('%s - channel header is not valid =>%s<=', method, check);
        throw Error(`Not able to build channel header ${check}`);
    }

    const chaincodeHeaderExtension = fabproto6.protos.ChaincodeHeaderExtension.create(fields);
    const chaincodeHeaderExtensionBuf = fabproto6.protos.ChaincodeHeaderExtension.encode(chaincodeHeaderExtension).finish();

    fields = {
        type: type,
        version: 1,
        channel_id: 'mychannel',
        tx_id: tx_id,
        extension: chaincodeHeaderExtensionBuf,
        timestamp: buildCurrentTimestamp(),
        tls_cert_hash: 'sas'
    };

    check = fabproto6.common.ChannelHeader.verify(fields);
    if (check) {
        console.log('%s - channel header is not valid =>%s<=', method, check);
        throw Error(`Not able to build channel header ${check}`);
    }

    const channelHeader = fabproto6.common.ChannelHeader.create(fields);
    return fabproto6.common.ChannelHeader.encode(channelHeader).finish();
}

async function buildHeader(channelHeaderBuf) {
    const signatureHeader = fabproto6.common.SignatureHeader.create({
        creator: 'creator',
        nonce: 'nonce',
    });
    const signatureHeaderBuf = fabproto6.common.SignatureHeader.encode(signatureHeader).finish();

    const header = fabproto6.common.Header.create({
        signature_header: signatureHeaderBuf,
        channel_header: channelHeaderBuf
    });

    return header;
}

async function buildPayload() {
    const chaincodeID = fabproto6.protos.ChaincodeID.create({
        name: 'fabcar',
        version: '',
        path: '',
    });

    const chaincodeInput = fabproto6.protos.ChaincodeInput.create({
        args: ['key', 'val'],
    });

    const chaincodeSpec = fabproto6.protos.ChaincodeSpec.create({
        type: fabproto6.protos.ChaincodeSpec.Type.GOLANG,
        chaincode_id: chaincodeID,
        input: chaincodeInput
    });

    const chaincodeInvocationSpec = fabproto6.protos.ChaincodeInvocationSpec.create({
        chaincode_spec: chaincodeSpec
    });
    const chaincodeInvocationSpecBuf = fabproto6.protos.ChaincodeInvocationSpec.encode(chaincodeInvocationSpec).finish();

    const fields = {
        input: chaincodeInvocationSpecBuf
    };
    const chaincodeProposalPayload = fabproto6.protos.ChaincodeProposalPayload.create(fields);
    const chaincodeProposalPayloadBuf = fabproto6.protos.ChaincodeProposalPayload.encode(chaincodeProposalPayload).finish();

    const channelHeaderBuf = await buildChannelHeader(
        fabproto6.common.HeaderType.ENDORSER_TRANSACTION,
        {
            name: 'fabcar',
            version: '1.0',
            path: '/where/to',
        },
        "txid1"
    );

    // save the header for use by the commit
    var header = await buildHeader(channelHeaderBuf);

    const headerBuf = fabproto6.common.Header.encode(header).finish();

    var proposal = fabproto6.protos.Proposal.create({
        header: headerBuf,
        payload: chaincodeProposalPayloadBuf
    });
    var payload = fabproto6.protos.Proposal.encode(proposal).finish();

    return payload;

}

async function buildSignedProposal() {
    const signature = Buffer.from("fewfwfdafewfdsafewxoxo");
    const payload = await buildPayload();

    const signedProposal = fabproto6.protos.SignedProposal.create({
        signature: signature,
        proposal_bytes: payload
    });

    return signedProposal;
}

async function main() {
    // var signedProposal = {
        // "proposal_bytes": new Buffer("17%%mychannel,key,val", "binary"),
        // "signature": new Buffer("17%%mychannel,key,val", "binary")}
    var signedProposal = await buildSignedProposal();
    console.log(signedProposal);
    client.processProposal(signedProposal, function(err, resp) {
        // console.log(signedProposal);
        if (err) {
            console.log(err);
        } else {
            console.log(resp);
        }
    });
}
main();
// console.log(signedProposal);


// console.log("wtf!?");
// console.log(client);
// console.log(endorserguide);
// console.log(protoDescriptor.protos.Endorser);

