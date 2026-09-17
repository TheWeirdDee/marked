// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { ProposalIntakeForm } from "./ProposalIntakeForm";

afterEach(() => {
  cleanup();
});

/**
 * CACTUS-LIVE-002 regression: a real production request came back as
 * `GET /app/new?` — the `url` field silently missing from the query string,
 * even though the user had typed a value and clicked "Resolve". Root cause:
 * the "resolving" state used to set `disabled` on the `url` input itself.
 * Per the HTML living standard, a form's outgoing entry list is built from
 * its controls' current state only after the `submit` event's handlers have
 * finished running — and a disabled control is excluded from that entry
 * list by every browser. Setting `disabled` synchronously inside `onSubmit`
 * therefore races (and can beat) the browser's own submission step.
 */
describe("ProposalIntakeForm", () => {
  it("never disables the url input on submit — a disabled field is silently dropped from a GET form's query string", () => {
    render(<ProposalIntakeForm defaultUrl="" />);
    const input = screen.getByPlaceholderText(/tally\.xyz/i) as HTMLInputElement;
    const form = input.closest("form");
    if (!form) throw new Error("expected the input to be inside a form");

    fireEvent.change(input, { target: { value: "https://www.tally.xyz/gov/compound/proposal/220" } });
    fireEvent.submit(form);

    expect(input.disabled).toBe(false);
    expect(input.value).toBe("https://www.tally.xyz/gov/compound/proposal/220");
  });

  it("still gives visible resolving feedback without excluding the url field from submission", () => {
    render(<ProposalIntakeForm defaultUrl="" />);
    const input = screen.getByPlaceholderText(/tally\.xyz/i) as HTMLInputElement;
    const form = input.closest("form");
    if (!form) throw new Error("expected the input to be inside a form");

    fireEvent.change(input, { target: { value: "https://www.tally.xyz/gov/optimism/proposal/1" } });
    fireEvent.submit(form);

    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("aria-busy")).toBe("true");
    const button = screen.getByRole("button", { name: /resolving/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("blocks submission client-side when the field is empty, without ever disabling the input", () => {
    render(<ProposalIntakeForm defaultUrl="" />);
    const input = screen.getByPlaceholderText(/tally\.xyz/i) as HTMLInputElement;
    const form = input.closest("form");
    if (!form) throw new Error("expected the input to be inside a form");

    fireEvent.submit(form);

    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
    const button = screen.getByRole("button", { name: /resolve proposal/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
