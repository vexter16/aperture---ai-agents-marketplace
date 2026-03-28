import 'dart:io';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const VeritasApp());
}

class VeritasApp extends StatelessWidget {
  const VeritasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Veritas Agent',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF020617), // slate-950
        primaryColor: const Color(0xFF06B6D4), // cyan-500
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF0F172A)), // slate-900
      ),
      home: const SubmitScreen(),
    );
  }
}

class SubmitScreen extends StatefulWidget {
  const SubmitScreen({super.key});

  @override
  State<SubmitScreen> createState() => _SubmitScreenState();
}

class _SubmitScreenState extends State<SubmitScreen> {
  // IMPORTANT: For Android emulator, use 10.0.2.2 instead of localhost
  // For physical device, use your Mac's local IP address (e.g., 192.168.1.5)
  final String apiUrl = "http://10.0.2.2:3001/facts"; 

  String wallet = "";
  final TextEditingController claimController = TextEditingController();
  final TextEditingController stakeController = TextEditingController(text: "2.00");
  String domain = "logistics";
  
  File? imageFile;
  Position? currentPosition;
  bool isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _initWallet();
  }

  // Simulates a persistent identity for Reputation (S_rep)
  Future<void> _initWallet() async {
    final prefs = await SharedPreferences.getInstance();
    String? savedWallet = prefs.getString('veritas_wallet');
    
    if (savedWallet == null) {
      final random = Random();
      savedWallet = "0x${List.generate(40, (_) => random.nextInt(16).toRadixString(16)).join()}";
      await prefs.setString('veritas_wallet', savedWallet);
    }
    
    setState(() {
      wallet = savedWallet!;
    });
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.camera);
    if (pickedFile != null) {
      setState(() {
        imageFile = File(pickedFile.path);
      });
    }
  }

  Future<void> _getLocation() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    Position position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
    setState(() {
      currentPosition = position;
    });
  }

  Future<void> _submitFact() async {
    if (claimController.text.isEmpty || imageFile == null || currentPosition == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Claim, Image, and GPS are required.'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => isSubmitting = true);

    try {
      var request = http.MultipartRequest('POST', Uri.parse(apiUrl));
      request.fields['wallet_address'] = wallet;
      request.fields['text_claim'] = claimController.text;
      request.fields['domain'] = domain;
      request.fields['stake_amount'] = stakeController.text;
      request.fields['latitude'] = currentPosition!.latitude.toString();
      request.fields['longitude'] = currentPosition!.longitude.toString();
      
      request.files.add(await http.MultipartFile.fromPath('image', imageFile!.path));

      var streamedResponse = await request.send();
      var response = await http.Response.fromStream(streamedResponse);
      var responseData = json.decode(response.body);

      if (response.statusCode == 201 || response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Success! Credibility: ${(responseData['credibility_score'] * 100).toStringAsFixed(0)}%'), backgroundColor: Colors.green),
        );
        setState(() {
          claimController.clear();
          imageFile = null;
        });
      } else {
        throw Exception(responseData['error'] ?? 'Upload failed');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Veritas Uplink', style: TextStyle(color: Color(0xFF06B6D4), fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('ID: ${wallet.length > 10 ? "${wallet.substring(0,6)}...${wallet.substring(wallet.length-4)}" : ""}', 
                style: const TextStyle(color: Colors.grey, fontFamily: 'monospace')),
            const SizedBox(height: 20),
            
            TextField(
              controller: claimController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Describe the event...',
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: domain,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'logistics', child: Text('Logistics')),
                      DropdownMenuItem(value: 'financial', child: Text('Financial')),
                      DropdownMenuItem(value: 'agricultural', child: Text('Agricultural')),
                    ],
                    onChanged: (val) => setState(() => domain = val!),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextField(
                    controller: stakeController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: 'Stake (USDC)',
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Evidence Buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                ElevatedButton.icon(
                  onPressed: _pickImage,
                  icon: const Icon(Icons.camera_alt),
                  label: Text(imageFile == null ? 'Capture' : 'Retake'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E293B), padding: const EdgeInsets.all(16)),
                ),
                ElevatedButton.icon(
                  onPressed: _getLocation,
                  icon: const Icon(Icons.location_on),
                  label: Text(currentPosition == null ? 'Get GPS' : 'GPS Locked'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: currentPosition == null ? const Color(0xFF1E293B) : Colors.green[800],
                    padding: const EdgeInsets.all(16)
                  ),
                ),
              ],
            ),
            const SizedBox(height: 40),

            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: isSubmitting ? null : _submitFact,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF06B6D4), // Cyan
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: isSubmitting 
                    ? const CircularProgressIndicator(color: Colors.white) 
                    : const Text('Lock Stake & Submit', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}