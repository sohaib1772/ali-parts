import { useEffect, useState } from "react";

export function useIsKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cleanupCapacitor: (() => void) | undefined;

    // 1. Capacitor Keyboard Plugin
    import("@capacitor/keyboard")
      .then(({ Keyboard }) => {
        const showSub = Keyboard.addListener("keyboardWillShow", () => setIsOpen(true));
        const didShowSub = Keyboard.addListener("keyboardDidShow", () => setIsOpen(true));
        const hideSub = Keyboard.addListener("keyboardWillHide", () => setIsOpen(false));
        const didHideSub = Keyboard.addListener("keyboardDidHide", () => setIsOpen(false));

        cleanupCapacitor = () => {
          showSub.then((s) => s.remove()).catch(() => {});
          didShowSub.then((s) => s.remove()).catch(() => {});
          hideSub.then((s) => s.remove()).catch(() => {});
          didHideSub.then((s) => s.remove()).catch(() => {});
        };
      })
      .catch(() => {});

    // 2. visualViewport resize detection (Safari / iOS WebView live-reload)
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.8;
        setIsOpen(isKeyboard);
      }
    };
    window.visualViewport?.addEventListener("resize", handleViewportResize);

    return () => {
      cleanupCapacitor?.();
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  return isOpen;
}
