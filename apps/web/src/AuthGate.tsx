import { createContext, useContext } from "react";

export const AuthGate = createContext({
  isGuest: false,
  requestSignIn: () => {},
});
export const useAuthGate = () => useContext(AuthGate);
