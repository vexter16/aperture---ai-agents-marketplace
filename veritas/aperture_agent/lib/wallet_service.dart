/// Aperture Wallet Service
/// 
/// Handles real Ethereum wallet management using web3dart.
/// Private keys are stored in the device's hardware-backed keystore
/// via flutter_secure_storage (NOT SharedPreferences).
/// 
/// Supports signing USDC approve + stakeFact transactions on Base Sepolia.

import 'dart:math';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web3dart/web3dart.dart';
import 'package:http/http.dart' as http;

// ─────────────────────────────────────────────
// CONSTANTS (Base Sepolia Testnet)
// ─────────────────────────────────────────────

const String _rpcUrl = 'https://sepolia.base.org';
const int _chainId = 84532;

/// Official Circle USDC on Base Sepolia
const String usdcContractAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/// USDC uses 6 decimals (not 18 like ETH)
const int _usdcDecimals = 6;

// Secure storage key
const String _privateKeyStorageKey = 'aperture_private_key_v1';

// ─────────────────────────────────────────────
// WALLET SERVICE
// ─────────────────────────────────────────────

class ApertureWalletService {
  static final FlutterSecureStorage _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  static Web3Client? _web3client;
  static EthPrivateKey? _credentials;
  static EthereumAddress? _address;

  /// Initialize the web3 client
  static Web3Client get _client {
    _web3client ??= Web3Client(_rpcUrl, http.Client());
    return _web3client!;
  }

  /// Load or generate a real Ethereum wallet.
  /// Returns the public wallet address (0x...).
  static Future<String> loadOrCreateWallet() async {
    // Try to load existing private key from secure storage
    String? storedKey = await _secureStorage.read(key: _privateKeyStorageKey);

    if (storedKey != null) {
      // Existing wallet found
      _credentials = EthPrivateKey.fromHex(storedKey);
    } else {
      // First launch — generate a cryptographically secure random private key
      final rng = Random.secure();
      final privateKeyBytes = List<int>.generate(32, (_) => rng.nextInt(256));
      final hexKey = privateKeyBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
      
      // Store securely in the device's hardware keystore
      await _secureStorage.write(key: _privateKeyStorageKey, value: hexKey);
      _credentials = EthPrivateKey.fromHex(hexKey);
    }

    _address = _credentials!.address;
    return _address!.hexEip55;
  }

  /// Get the current wallet address (must call loadOrCreateWallet first)
  static String get walletAddress => _address?.hexEip55 ?? '';

  /// Check if the wallet has been initialized
  static bool get isInitialized => _credentials != null;

  /// Export the private key (for display in settings — user can back it up)
  static Future<String?> exportPrivateKey() async {
    return await _secureStorage.read(key: _privateKeyStorageKey);
  }

  /// Import a private key (user pastes their existing key)
  static Future<String> importPrivateKey(String hexKey) async {
    // Strip 0x prefix if present
    final cleanKey = hexKey.startsWith('0x') ? hexKey.substring(2) : hexKey;
    
    // Validate: must be 64 hex characters
    if (cleanKey.length != 64 || !RegExp(r'^[a-fA-F0-9]+$').hasMatch(cleanKey)) {
      throw Exception('Invalid private key format. Expected 64 hex characters.');
    }

    // Save and reload
    await _secureStorage.write(key: _privateKeyStorageKey, value: cleanKey);
    _credentials = EthPrivateKey.fromHex(cleanKey);
    _address = _credentials!.address;
    return _address!.hexEip55;
  }

  /// Reset wallet (generate a new one)
  static Future<String> resetWallet() async {
    await _secureStorage.delete(key: _privateKeyStorageKey);
    _credentials = null;
    _address = null;
    return await loadOrCreateWallet();
  }

  // ─────────────────────────────────────────────
  // BALANCE QUERIES
  // ─────────────────────────────────────────────

  /// Get ETH balance (needed for gas)
  static Future<double> getEthBalance() async {
    if (_address == null) return 0;
    try {
      final balance = await _client.getBalance(_address!);
      return balance.getValueInUnit(EtherUnit.ether);
    } catch (e) {
      return 0;
    }
  }

  /// Get USDC balance by calling the ERC-20 balanceOf function
  static Future<double> getUsdcBalance() async {
    if (_address == null) return 0;
    try {
      // Define a minimal ERC-20 ABI with just balanceOf
      final erc20Abi = ContractAbi.fromJson(
        '[{"constant":true,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"}]',
        'USDC',
      );
      final usdcContract = DeployedContract(
        erc20Abi,
        EthereumAddress.fromHex(usdcContractAddress),
      );
      final balanceOfFunction = usdcContract.function('balanceOf');

      final result = await _client.call(
        contract: usdcContract,
        function: balanceOfFunction,
        params: [_address!],
      );

      // result[0] is a BigInt representing the balance in 6-decimal units
      final BigInt rawBalance = result[0] as BigInt;
      return rawBalance.toDouble() / 1000000; // 6 decimals → dollars
    } catch (e) {
      // ignore: avoid_print
      print('⚠️ USDC balance query failed: $e');
      return 0;
    }
  }

  // ─────────────────────────────────────────────
  // ON-CHAIN SIGNING (True Decentralized Staking)
  // ─────────────────────────────────────────────

  /// Sign and send the USDC approve transaction.
  /// This authorizes the ApertureVault to pull USDC from the human's wallet.
  static Future<String> signApproveTransaction(Map<String, dynamic> txData) async {
    if (_credentials == null) throw Exception('Wallet not initialized');

    final to = EthereumAddress.fromHex(txData['to']);
    final data = _hexToBytes(txData['data']);
    
    final transaction = Transaction(
      to: to,
      data: data,
      maxGas: 250000,
    );

    final txHash = await _client.sendTransaction(
      _credentials!,
      transaction,
      chainId: _chainId,
    );

    return txHash;
  }

  /// Sign and send the vault stakeFact transaction.
  /// This locks the USDC in the ApertureVault smart contract.
  static Future<String> signStakeTransaction(Map<String, dynamic> txData) async {
    if (_credentials == null) throw Exception('Wallet not initialized');

    final to = EthereumAddress.fromHex(txData['to']);
    final data = _hexToBytes(txData['data']);

    final transaction = Transaction(
      to: to,
      data: data,
      maxGas: 600000,
    );

    final txHash = await _client.sendTransaction(
      _credentials!,
      transaction,
      chainId: _chainId,
    );

    return txHash;
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  /// Convert a hex string (with or without 0x prefix) to Uint8List
  static Uint8List _hexToBytes(String hex) {
    final cleanHex = hex.startsWith('0x') ? hex.substring(2) : hex;
    final bytes = <int>[];
    for (int i = 0; i < cleanHex.length; i += 2) {
      bytes.add(int.parse(cleanHex.substring(i, i + 2), radix: 16));
    }
    return Uint8List.fromList(bytes);
  }
}
