import 'package:flutter_test/flutter_test.dart';
import 'package:aperture_agent/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(const ApertureApp());
    // Verify the app shell renders with the bottom navigation
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Submit'), findsOneWidget);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
  });
}
