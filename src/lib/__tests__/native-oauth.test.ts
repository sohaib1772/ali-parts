import { describe, expect, it } from "vitest";
import { NATIVE_REDIRECT_URL, paramsFromRedirect } from "../native-oauth";

// The redirect URL is the one value shared by three places that cannot import
// each other: this module, the Android intent-filter, and the Supabase
// allow-list. If it changes here, both of those have to change too.
describe("NATIVE_REDIRECT_URL", () => {
  it("matches the scheme+host registered in AndroidManifest.xml", () => {
    expect(NATIVE_REDIRECT_URL).toBe("com.mkteb.ali.chevrolet://auth");
  });
});

describe("paramsFromRedirect", () => {
  it("reads the PKCE code from the query string", () => {
    const params = paramsFromRedirect("com.mkteb.ali.chevrolet://auth?code=abc123");
    expect(params.get("code")).toBe("abc123");
  });

  it("reads provider errors from the query string", () => {
    const params = paramsFromRedirect(
      "com.mkteb.ali.chevrolet://auth?error=access_denied&error_description=User%20cancelled",
    );
    expect(params.get("error")).toBe("access_denied");
    expect(params.get("error_description")).toBe("User cancelled");
  });

  it("reads params delivered as a fragment", () => {
    const params = paramsFromRedirect("com.mkteb.ali.chevrolet://auth#error=server_error");
    expect(params.get("error")).toBe("server_error");
  });

  it("merges query and fragment, query winning", () => {
    const params = paramsFromRedirect("com.mkteb.ali.chevrolet://auth?code=fromQuery#code=fromHash");
    expect(params.get("code")).toBe("fromQuery");
  });

  it("does not leak the fragment into a query value", () => {
    const params = paramsFromRedirect("com.mkteb.ali.chevrolet://auth?code=abc#state=xyz");
    expect(params.get("code")).toBe("abc");
    expect(params.get("state")).toBe("xyz");
  });

  it("returns nothing for a bare redirect with no payload", () => {
    const params = paramsFromRedirect(NATIVE_REDIRECT_URL);
    expect(params.get("code")).toBeNull();
    expect(params.get("error")).toBeNull();
  });

  it("decodes percent-encoded values", () => {
    const params = paramsFromRedirect("com.mkteb.ali.chevrolet://auth?code=a%2Bb%2Fc");
    expect(params.get("code")).toBe("a+b/c");
  });
});
