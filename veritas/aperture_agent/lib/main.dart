import 'dart:io';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:google_fonts/google_fonts.dart';


// ─────────────────────────────────────────────
// APERTURE AGENT — MOBILE INTELLIGENCE CLIENT
// ─────────────────────────────────────────────

void main() {
  runApp(const ApertureApp());
}

// ─── Color Palette (matches web dashboard) ───
class AppColors {
  static const bg = Color(0xFF020617);       // slate-950
  static const surface = Color(0xFF0F172A);  // slate-900
  static const card = Color(0xFF1E293B);     // slate-800
  static const border = Color(0xFF334155);   // slate-700
  static const textPrimary = Color(0xFFF1F5F9); // slate-100
  static const textSecondary = Color(0xFF94A3B8); // slate-400
  static const textMuted = Color(0xFF64748B);    // slate-500
  static const cyan = Color(0xFF06B6D4);
  static const cyanDark = Color(0xFF0891B2);
  static const green = Color(0xFF10B981);
  static const amber = Color(0xFFF59E0B);
  static const red = Color(0xFFEF4444);
}

class ApertureApp extends StatelessWidget {
  const ApertureApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aperture Agent',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.bg,
        primaryColor: AppColors.cyan,
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.surface,
          elevation: 0,
          centerTitle: true,
        ),
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
        colorScheme: ColorScheme.dark(
          primary: AppColors.cyan,
          surface: AppColors.surface,
        ),
      ),
      home: const AppShell(),
    );
  }
}

// ─── App Shell with Bottom Navigation ───
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentIndex = 0;
  String _wallet = '';
  String _apiUrl = '';
  int _submissionCount = 0;
  double? _lastScore;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();

    // Wallet
    String? savedWallet = prefs.getString('aperture_wallet');
    if (savedWallet == null) {
      final random = Random();
      savedWallet = '0x${List.generate(40, (_) => random.nextInt(16).toRadixString(16)).join()}';
      await prefs.setString('aperture_wallet', savedWallet);
    }

    // API URL
    String? savedUrl = prefs.getString('aperture_api_url');
    savedUrl ??= 'http://localhost:3001';

    // Stats
    int count = prefs.getInt('submission_count') ?? 0;
    double? lastScore = prefs.getDouble('last_score');

    setState(() {
      _wallet = savedWallet!;
      _apiUrl = savedUrl!;
      _submissionCount = count;
      _lastScore = lastScore;
    });
  }

  void _onSubmissionSuccess(double score) async {
    final prefs = await SharedPreferences.getInstance();
    int newCount = _submissionCount + 1;
    await prefs.setInt('submission_count', newCount);
    await prefs.setDouble('last_score', score);
    setState(() {
      _submissionCount = newCount;
      _lastScore = score;
    });
  }

  void _onApiUrlChanged(String newUrl) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('aperture_api_url', newUrl);
    setState(() {
      _apiUrl = newUrl;
    });
  }

  void _onWalletReset() async {
    final prefs = await SharedPreferences.getInstance();
    final random = Random();
    String newWallet = '0x${List.generate(40, (_) => random.nextInt(16).toRadixString(16)).join()}';
    await prefs.setString('aperture_wallet', newWallet);
    await prefs.setInt('submission_count', 0);
    await prefs.remove('last_score');
    setState(() {
      _wallet = newWallet;
      _submissionCount = 0;
      _lastScore = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    void navigateToTab(int index) {
      setState(() => _currentIndex = index);
    }

    final screens = [
      HomeScreen(wallet: _wallet, submissionCount: _submissionCount, lastScore: _lastScore, onNavigate: navigateToTab),
      SubmitScreen(wallet: _wallet, apiUrl: _apiUrl, onSuccess: _onSubmissionSuccess),
      HistoryScreen(apiUrl: _apiUrl),
      SettingsScreen(
        wallet: _wallet,
        apiUrl: _apiUrl,
        onApiUrlChanged: _onApiUrlChanged,
        onWalletReset: _onWalletReset,
      ),
    ];

    return Scaffold(
      body: screens[_currentIndex],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (i) => setState(() => _currentIndex = i),
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: AppColors.cyan,
          unselectedItemColor: AppColors.textMuted,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_rounded), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.add_circle_outline_rounded), label: 'Submit'),
            BottomNavigationBarItem(icon: Icon(Icons.history_rounded), label: 'History'),
            BottomNavigationBarItem(icon: Icon(Icons.settings_rounded), label: 'Settings'),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// SCREEN 1: HOME DASHBOARD
// ─────────────────────────────────────────────
class HomeScreen extends StatelessWidget {
  final String wallet;
  final int submissionCount;
  final double? lastScore;
  final Function(int) onNavigate;

  const HomeScreen({super.key, required this.wallet, required this.submissionCount, this.lastScore, required this.onNavigate});

  String get _shortWallet =>
      wallet.length > 10 ? '${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}' : wallet;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            // Header
            Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.cyan, AppColors.cyanDark]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.shield_rounded, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('APERTURE AGENT', style: GoogleFonts.inter(
                      fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.cyan, letterSpacing: 2,
                    )),
                    Text('Intelligence Uplink v1.0', style: GoogleFonts.inter(
                      fontSize: 12, color: AppColors.textMuted,
                    )),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Wallet Card
            _GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.account_balance_wallet_rounded, color: AppColors.cyan, size: 18),
                      const SizedBox(width: 8),
                      Text('WALLET IDENTITY', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
                      )),
                    ],
                  ),
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: wallet));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Wallet copied to clipboard'), duration: Duration(seconds: 1)),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppColors.bg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(_shortWallet, style: GoogleFonts.jetBrainsMono(
                              fontSize: 15, color: AppColors.textPrimary,
                            )),
                          ),
                          const Icon(Icons.copy_rounded, size: 16, color: AppColors.textMuted),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Stats Row
            Row(
              children: [
                Expanded(child: _StatCard(
                  label: 'SUBMISSIONS',
                  value: submissionCount.toString(),
                  icon: Icons.upload_rounded,
                  color: AppColors.cyan,
                )),
                const SizedBox(width: 12),
                Expanded(child: _StatCard(
                  label: 'LAST SCORE',
                  value: lastScore != null ? '${(lastScore! * 100).toFixed(0)}%' : '—',
                  icon: Icons.speed_rounded,
                  color: lastScore != null
                      ? (lastScore! >= 0.7 ? AppColors.green : (lastScore! >= 0.5 ? AppColors.amber : AppColors.red))
                      : AppColors.textMuted,
                )),
              ],
            ),
            const SizedBox(height: 16),

            // Status Card
            _GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8, height: 8,
                        decoration: const BoxDecoration(color: AppColors.green, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 8),
                      Text('SYSTEM STATUS', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
                      )),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _StatusRow(label: 'Credibility Engine', value: 'V3.1 — 6 Signals'),
                  const SizedBox(height: 8),
                  _StatusRow(label: 'Classification', value: '3-Tier Bayesian'),
                  const SizedBox(height: 8),
                  _StatusRow(label: 'Settlement', value: 'Stake & Slash'),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Quick Submit CTA
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: () => onNavigate(1),
                icon: const Icon(Icons.add_circle_outline, color: Colors.white),
                label: Text('SUBMIT INTELLIGENCE', style: GoogleFonts.inter(
                  fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1,
                )),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.cyan,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// SCREEN 2: SUBMIT INTELLIGENCE
// ─────────────────────────────────────────────
class SubmitScreen extends StatefulWidget {
  final String wallet;
  final String apiUrl;
  final Function(double score) onSuccess;

  const SubmitScreen({super.key, required this.wallet, required this.apiUrl, required this.onSuccess});

  @override
  State<SubmitScreen> createState() => _SubmitScreenState();
}

class _SubmitScreenState extends State<SubmitScreen> {
  final TextEditingController claimController = TextEditingController();
  final TextEditingController stakeController = TextEditingController(text: '2.00');
  String domain = 'logistics';

  File? imageFile;
  Position? currentPosition;
  bool isSubmitting = false;

  final List<Map<String, dynamic>> domains = [
    {'value': 'logistics', 'label': 'Logistics', 'icon': Icons.local_shipping_rounded},
    {'value': 'financial', 'label': 'Financial', 'icon': Icons.trending_up_rounded},
    {'value': 'agricultural', 'label': 'Agricultural', 'icon': Icons.eco_rounded},
    {'value': 'maritime-logistics', 'label': 'Maritime', 'icon': Icons.sailing_rounded},
    {'value': 'energy', 'label': 'Energy', 'icon': Icons.bolt_rounded},
    {'value': 'infrastructure', 'label': 'Infrastructure', 'icon': Icons.domain_rounded},
  ];

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 50,
      maxWidth: 1920,
    );
    if (pickedFile != null) {
      setState(() {
        imageFile = File(pickedFile.path);
      });
    }
  }

  Future<void> _getLocation() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enable GPS/Location Services')),
      );
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }
    if (permission == LocationPermission.deniedForever) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Location permissions permanently denied. Enable in Settings.')),
      );
      return;
    }

    Position position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    setState(() {
      currentPosition = position;
    });
  }

  Future<void> _submitFact() async {
    if (claimController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please describe the event'), backgroundColor: AppColors.red),
      );
      return;
    }
    if (currentPosition == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('GPS coordinates required. Tap "Lock GPS" first.'), backgroundColor: AppColors.red),
      );
      return;
    }

    setState(() => isSubmitting = true);

    try {
      final url = '${widget.apiUrl}/facts';
      var request = http.MultipartRequest('POST', Uri.parse(url));
      request.fields['wallet_address'] = widget.wallet;
      request.fields['text_claim'] = claimController.text;
      request.fields['domain'] = domain;
      request.fields['stake_amount'] = stakeController.text;
      request.fields['latitude'] = currentPosition!.latitude.toString();
      request.fields['longitude'] = currentPosition!.longitude.toString();

      if (imageFile != null) {
        request.files.add(await http.MultipartFile.fromPath('image', imageFile!.path));
      }

      var streamedResponse = await request.send().timeout(const Duration(seconds: 15));
      var response = await http.Response.fromStream(streamedResponse);
      var responseData = json.decode(response.body);

      if (response.statusCode == 201 || response.statusCode == 200) {
        double score = (responseData['credibility_score'] as num).toDouble();
        widget.onSuccess(score);
        _showSuccessDialog(score, responseData['status'] ?? '');
        setState(() {
          claimController.clear();
          imageFile = null;
        });
      } else if (response.statusCode == 403) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('🚨 REJECTED — Sybil/Bot behavior detected by the network.'),
            backgroundColor: AppColors.red,
          ),
        );
      } else {
        throw Exception(responseData['error'] ?? 'Upload failed');
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Connection Error: $e'),
          backgroundColor: Colors.orange[800],
        ),
      );
    } finally {
      if (mounted) setState(() => isSubmitting = false);
    }
  }

  void _showSuccessDialog(double score, String status) {
    int percentage = (score * 100).round();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: AppColors.green, size: 28),
            const SizedBox(width: 10),
            Text('Intelligence Staked', style: GoogleFonts.inter(
              color: AppColors.textPrimary, fontWeight: FontWeight.w700,
            )),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your \$${stakeController.text} USDC stake is now LOCKED.',
              style: GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 20),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                decoration: BoxDecoration(
                  color: (percentage >= 70 ? AppColors.green : AppColors.amber).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: percentage >= 70 ? AppColors.green : AppColors.amber, width: 1),
                ),
                child: Text('$percentage%', style: GoogleFonts.jetBrainsMono(
                  fontSize: 32, fontWeight: FontWeight.w800,
                  color: percentage >= 70 ? AppColors.green : AppColors.amber,
                )),
              ),
            ),
            const SizedBox(height: 14),
            Center(
              child: Text(
                status == 'APPROVED_FOR_MARKET' ? 'APPROVED FOR MARKET' : 'PENDING CORROBORATION',
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5,
                  color: status == 'APPROVED_FOR_MARKET' ? AppColors.green : AppColors.amber,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text('Awaiting agent verification for terminal settlement.',
                style: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('ACKNOWLEDGE', style: GoogleFonts.inter(
              color: AppColors.cyan, fontWeight: FontWeight.w700, letterSpacing: 1,
            )),
          ),
        ],
      ),
    );
  }

  Color get _gpsColor {
    if (currentPosition == null) return AppColors.textMuted;
    if (currentPosition!.accuracy < 10) return AppColors.green;
    if (currentPosition!.accuracy < 50) return AppColors.amber;
    return AppColors.red;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('SUBMIT INTELLIGENCE', style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.cyan, letterSpacing: 2,
        )),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Claim Input
            Text('EVENT DESCRIPTION', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
            )),
            const SizedBox(height: 8),
            TextField(
              controller: claimController,
              maxLines: 4,
              style: GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Describe the ground-truth event you are witnessing...',
                hintStyle: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 13),
                filled: true,
                fillColor: AppColors.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.cyan),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Domain + Stake Row
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('DOMAIN', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
                      )),
                      const SizedBox(height: 8),
                      // ignore: deprecated_member_use
                      DropdownButtonFormField<String>(
                        value: domain,
                        dropdownColor: AppColors.card,
                        isExpanded: true,
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: AppColors.card,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                        ),
                        items: domains.map((d) => DropdownMenuItem(
                          value: d['value'] as String,
                          child: Row(
                            children: [
                              Icon(d['icon'] as IconData, size: 16, color: AppColors.cyan),
                              const SizedBox(width: 8),
                              Text(d['label'] as String, style: GoogleFonts.inter(
                                color: AppColors.textPrimary, fontSize: 13,
                              )),
                            ],
                          ),
                        )).toList(),
                        onChanged: (val) => setState(() => domain = val!),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('STAKE (USDC)', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
                      )),
                      const SizedBox(height: 8),
                      TextField(
                        controller: stakeController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: GoogleFonts.jetBrainsMono(color: AppColors.textPrimary, fontSize: 15),
                        decoration: InputDecoration(
                          prefixText: '\$ ',
                          prefixStyle: GoogleFonts.jetBrainsMono(color: AppColors.textMuted),
                          filled: true,
                          fillColor: AppColors.card,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.border),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: AppColors.cyan),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Evidence Row: Camera + GPS
            Row(
              children: [
                // Camera Button + Preview
                Expanded(
                  child: GestureDetector(
                    onTap: _pickImage,
                    child: Container(
                      height: 110,
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: imageFile != null ? AppColors.green : AppColors.border),
                        image: imageFile != null
                            ? DecorationImage(image: FileImage(imageFile!), fit: BoxFit.cover)
                            : null,
                      ),
                      child: imageFile == null
                          ? Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.camera_alt_rounded, color: AppColors.textMuted, size: 28),
                                const SizedBox(height: 6),
                                Text('CAPTURE', style: GoogleFonts.inter(
                                  fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1,
                                )),
                              ],
                            )
                          : Align(
                              alignment: Alignment.topRight,
                              child: Container(
                                margin: const EdgeInsets.all(6),
                                padding: const EdgeInsets.all(4),
                                decoration: const BoxDecoration(color: AppColors.green, shape: BoxShape.circle),
                                child: const Icon(Icons.check, color: Colors.white, size: 14),
                              ),
                            ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // GPS Button + Accuracy
                Expanded(
                  child: GestureDetector(
                    onTap: _getLocation,
                    child: Container(
                      height: 110,
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: currentPosition != null ? _gpsColor : AppColors.border),
                      ),
                      child: currentPosition == null
                          ? Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.location_on_rounded, color: AppColors.textMuted, size: 28),
                                const SizedBox(height: 6),
                                Text('LOCK GPS', style: GoogleFonts.inter(
                                  fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1,
                                )),
                              ],
                            )
                          : Padding(
                              padding: const EdgeInsets.all(10),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.gps_fixed_rounded, color: _gpsColor, size: 22),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${currentPosition!.latitude.toStringAsFixed(4)}, ${currentPosition!.longitude.toStringAsFixed(4)}',
                                    style: GoogleFonts.jetBrainsMono(fontSize: 10, color: AppColors.textSecondary),
                                    textAlign: TextAlign.center,
                                  ),
                                  const SizedBox(height: 4),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _gpsColor.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      '±${currentPosition!.accuracy.toStringAsFixed(0)}m',
                                      style: GoogleFonts.jetBrainsMono(fontSize: 10, fontWeight: FontWeight.w700, color: _gpsColor),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: isSubmitting ? null : _submitFact,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.cyan,
                  disabledBackgroundColor: AppColors.cyan.withValues(alpha: 0.4),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: isSubmitting
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.lock_rounded, color: Colors.white, size: 20),
                          const SizedBox(width: 10),
                          Text('LOCK STAKE & SUBMIT', style: GoogleFonts.inter(
                            fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1.5,
                          )),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// SCREEN 3: SUBMISSION HISTORY
// ─────────────────────────────────────────────
class HistoryScreen extends StatefulWidget {
  final String apiUrl;
  const HistoryScreen({super.key, required this.apiUrl});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<dynamic> facts = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _fetchFacts();
  }

  Future<void> _fetchFacts() async {
    setState(() => loading = true);
    try {
      final res = await http.get(Uri.parse('${widget.apiUrl}/facts')).timeout(const Duration(seconds: 10));
      final data = json.decode(res.body);
      setState(() {
        facts = data['facts'] ?? [];
        loading = false;
      });
    } catch (e) {
      setState(() {
        facts = [];
        loading = false;
      });
    }
  }

  Color _scoreColor(double score) {
    if (score >= 0.7) return AppColors.green;
    if (score >= 0.5) return AppColors.amber;
    return AppColors.red;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('NETWORK ACTIVITY', style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.cyan, letterSpacing: 2,
        )),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textMuted),
            onPressed: _fetchFacts,
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.cyan))
          : facts.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.inbox_rounded, color: AppColors.textMuted, size: 48),
                      const SizedBox(height: 12),
                      Text('No facts in the network yet', style: GoogleFonts.inter(color: AppColors.textMuted)),
                      const SizedBox(height: 4),
                      Text('Submit your first intelligence report!', style: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 12)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _fetchFacts,
                  color: AppColors.cyan,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: facts.length,
                    itemBuilder: (context, index) {
                      final fact = facts[index];
                      final score = (fact['credibility_score'] as num?)?.toDouble() ?? 0.0;
                      final claim = fact['text_claim'] ?? '';
                      final factDomain = fact['domain'] ?? '';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border, width: 0.5),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(
                                color: _scoreColor(score).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Center(
                                child: Text(
                                  '${(score * 100).round()}',
                                  style: GoogleFonts.jetBrainsMono(
                                    fontSize: 14, fontWeight: FontWeight.w800, color: _scoreColor(score),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    claim,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 13, height: 1.4),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppColors.cyan.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          factDomain.toString().toUpperCase(),
                                          style: GoogleFonts.inter(
                                            fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.cyan, letterSpacing: 1,
                                          ),
                                        ),
                                      ),
                                      const Spacer(),
                                      Text(
                                        '\$${fact['price_usdc'] ?? '0.05'} USDC',
                                        style: GoogleFonts.jetBrainsMono(fontSize: 10, color: AppColors.textMuted),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

// ─────────────────────────────────────────────
// SCREEN 4: SETTINGS
// ─────────────────────────────────────────────
class SettingsScreen extends StatefulWidget {
  final String wallet;
  final String apiUrl;
  final Function(String) onApiUrlChanged;
  final VoidCallback onWalletReset;

  const SettingsScreen({
    super.key,
    required this.wallet,
    required this.apiUrl,
    required this.onApiUrlChanged,
    required this.onWalletReset,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController urlController;

  @override
  void initState() {
    super.initState();
    urlController = TextEditingController(text: widget.apiUrl);
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiUrl != widget.apiUrl) {
      urlController.text = widget.apiUrl;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('SETTINGS', style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.cyan, letterSpacing: 2,
        )),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Backend URL
            Text('BACKEND API URL', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
            )),
            const SizedBox(height: 4),
            Text('Set to your Mac\'s IP for local testing, or an ngrok URL for remote testing.',
              style: GoogleFonts.inter(fontSize: 11, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: urlController,
                    style: GoogleFonts.jetBrainsMono(color: AppColors.textPrimary, fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'http://192.168.1.5:3001',
                      hintStyle: GoogleFonts.jetBrainsMono(color: AppColors.textMuted, fontSize: 12),
                      filled: true,
                      fillColor: AppColors.card,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: AppColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: AppColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: AppColors.cyan),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: () {
                    widget.onApiUrlChanged(urlController.text.trim());
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('✅ Backend URL saved'), duration: Duration(seconds: 1)),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.cyan,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text('SAVE', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ],
            ),
            const SizedBox(height: 32),

            // Wallet Section
            Text('WALLET IDENTITY', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
            )),
            const SizedBox(height: 10),
            _GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Current Wallet Address:', style: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 12)),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: widget.wallet));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Copied!'), duration: Duration(seconds: 1)),
                      );
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.bg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(widget.wallet, style: GoogleFonts.jetBrainsMono(
                        fontSize: 11, color: AppColors.textSecondary,
                      )),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        showDialog(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            backgroundColor: AppColors.surface,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            title: Text('Reset Wallet?', style: GoogleFonts.inter(color: AppColors.textPrimary)),
                            content: Text(
                              'This generates a new identity. Your old submission history and reputation will be lost.',
                              style: GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 13),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.of(ctx).pop(),
                                child: Text('Cancel', style: GoogleFonts.inter(color: AppColors.textMuted)),
                              ),
                              TextButton(
                                onPressed: () {
                                  widget.onWalletReset();
                                  Navigator.of(ctx).pop();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('🔑 New wallet generated')),
                                  );
                                },
                                child: Text('RESET', style: GoogleFonts.inter(color: AppColors.red, fontWeight: FontWeight.w700)),
                              ),
                            ],
                          ),
                        );
                      },
                      icon: const Icon(Icons.refresh_rounded, color: AppColors.red, size: 18),
                      label: Text('GENERATE NEW WALLET', style: GoogleFonts.inter(
                        color: AppColors.red, fontWeight: FontWeight.w600, fontSize: 12,
                      )),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.red, width: 0.5),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // About
            Text('ABOUT', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 1.5,
            )),
            const SizedBox(height: 10),
            _GlassCard(
              child: Column(
                children: [
                  _StatusRow(label: 'Protocol', value: 'Aperture v1.0'),
                  const SizedBox(height: 8),
                  _StatusRow(label: 'Engine', value: '6-Signal Bayesian V3.1'),
                  const SizedBox(height: 8),
                  _StatusRow(label: 'Settlement', value: 'Stake & Slash'),
                  const SizedBox(height: 8),
                  _StatusRow(label: 'Payments', value: 'x402 HTTP Protocol'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// REUSABLE COMPONENTS
// ─────────────────────────────────────────────

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border, width: 0.5),
      ),
      child: child,
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 10),
          Text(value, style: GoogleFonts.jetBrainsMono(
            fontSize: 22, fontWeight: FontWeight.w800, color: color,
          )),
          const SizedBox(height: 4),
          Text(label, style: GoogleFonts.inter(
            fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textMuted, letterSpacing: 1,
          )),
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatusRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 12)),
        Text(value, style: GoogleFonts.inter(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// Extension for toFixed on double (Dart doesn't have it natively)
extension DoubleFormat on double {
  String toFixed(int decimals) => toStringAsFixed(decimals);
}