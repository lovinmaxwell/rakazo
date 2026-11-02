import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeActionButton } from "../components/native-action-button";
import { cancelHeaderOptions } from "../components/sheet-header";
import { rpc } from "../lib/api";
import { apiBaseWarning, displayApiHost } from "../lib/endpoint";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { pairingFrom, pairThisPhone } from "../lib/pairing";
import { useSideInsets } from "../lib/side-insets";

/**
 * Opened by a pairing QR code (`rakazo://pair?server=…&code=…`) or by pasting its link. It names
 * the server and asks before switching: a code is a sign-in, and switching servers signs this
 * phone out of the one it uses now.
 */
export default function PairScreen() {
  const sideInsets = useSideInsets();
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ server?: string; code?: string }>();
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const pairing = useRef(false);

  useEffect(() => {
    return () => {
      active.current = false;
    };
  }, []);

  const target = pairingFrom({ server: params.server, code: params.code, link: pasted });
  const warning = target ? apiBaseWarning(target.server) : null;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace("/sign-in");
  }

  async function pair() {
    if (!target || pairing.current) return;
    pairing.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await pairThisPhone(target);
      if (!active.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const me = await rpc("me").catch(() => null);
      if (!active.current) return;
      router.replace(me?.needsSignupSurvey ? "/signup-survey" : "/");
    } finally {
      pairing.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen
        options={{ title: t("Pair this phone"), ...cancelHeaderOptions(t("Cancel"), close) }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={sideInsets}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {target ? (
            <>
              <Text style={{ color: tokens.foreground, fontSize: 17, fontWeight: "600" }}>
                {displayApiHost(target.server)}
              </Text>
              <Text style={{ color: tokens.mutedForeground, marginTop: 8, fontSize: 14 }}>
                {t(
                  "Sign in to this server without typing a password. This phone will be signed out of any other server it uses now.",
                )}
              </Text>
              {warning ? (
                <Text style={{ color: tokens.mutedForeground, marginTop: 12, fontSize: 13 }}>
                  {warning}
                </Text>
              ) : null}
              <NativeActionButton
                busy={pending}
                disabled={pending}
                label={pending ? t("Pairing…") : t("Pair this phone")}
                onPress={() => void pair()}
                style={{ marginTop: 24 }}
              />
            </>
          ) : (
            <>
              <Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>
                {t(
                  "On a device you are signed in on, open Settings, choose Pair a phone, and scan the QR code with this phone's camera. Or paste the link here.",
                )}
              </Text>
              <TextInput
                testID="pairing-link"
                accessibilityLabel={t("Pairing link")}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={(value) => {
                  setPasted(value);
                  setError(null);
                }}
                placeholder="https://…/pair#code=…"
                placeholderTextColor={tokens.mutedForeground}
                style={{
                  backgroundColor: tokens.muted,
                  borderRadius: 13,
                  padding: 16,
                  marginTop: 16,
                  color: tokens.foreground,
                  fontSize: 16,
                }}
                value={pasted}
              />
              {pasted.trim() ? (
                <Text style={{ color: tokens.destructive, marginTop: 12 }}>
                  {t("That is not a pairing link")}
                </Text>
              ) : null}
            </>
          )}
          {error ? <Text style={{ color: tokens.destructive, marginTop: 12 }}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
