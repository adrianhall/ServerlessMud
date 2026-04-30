import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../../src/client/App";

beforeEach(() => {
  // Default: successful fetch. Individual tests override as needed.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ name: "ServerlessMud", version: "0.0.1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
});

describe("App", () => {
  it("renders the loading state initially", () => {
    render(<App />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("renders the page heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ServerlessMud");
  });

  it("shows connected state after successful fetch", async () => {
    render(<App />);
    expect(await screen.findByText(/Connected to ServerlessMud v0\.0\.1/)).toBeInTheDocument();
  });

  it("shows error message when fetch rejects with an Error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

    render(<App />);
    expect(await screen.findByText("API error: Network failure")).toBeInTheDocument();
  });

  it("shows 'Unknown error' when fetch rejects with a non-Error value", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("something went wrong");

    render(<App />);
    expect(await screen.findByText("API error: Unknown error")).toBeInTheDocument();
  });

  it("shows error when API responds with non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/API error:/)).toBeInTheDocument();
    });
    expect(screen.getByText("API error: API responded with 500")).toBeInTheDocument();
  });
});
