import * as Bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import * as bip322 from "bip322-js";
import wif from "wif";

Bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export const signMessage = (privateKey: Buffer, messageHash: Buffer): Buffer => {
  if (privateKey.length !== 32) {
    throw new Error(`Expected 32 bytes of private key, got ${privateKey.length}`);
  }

  const keyPair = ECPair.fromPrivateKey(privateKey, {
    compressed: true,
    network: Bitcoin.networks.testnet
  });

  const internalPubkey = keyPair.publicKey.slice(1, 33);
  const { address } = Bitcoin.payments.p2tr({
    internalPubkey,
    network: Bitcoin.networks.testnet
  });

  if (!address) {
    throw new Error("Failed to generate address");
  }

  const messageString = messageHash.toString("hex");
  const privateKeyWIF = wif.encode(
    239, // testnet
    privateKey,
    true  // compressed
  );

  const signature = bip322.Signer.sign(
    privateKeyWIF,
    address,
    messageString
  );

  const signatureBuffer = Buffer.from(signature as string, "base64");
  const schnorrSignature = signatureBuffer.slice(-65, -1);

  return Buffer.from(schnorrSignature);
};