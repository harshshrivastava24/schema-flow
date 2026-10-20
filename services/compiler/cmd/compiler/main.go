package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/harsh/backendgen/services/compiler/internal/engine"
	"github.com/harsh/backendgen/services/compiler/internal/ir"
)

// Version is the compiler version, used by --version and in preview responses.
const Version = "1.0.0"

func main() {
	versionFlag := flag.Bool("version", false, "print compiler version")
	flag.Parse()

	if *versionFlag {
		fmt.Printf(`{"status":"ok","version":"%s"}`+"\n", Version)
		return
	}

	// Read a single JSON request from stdin, terminated by EOF.
	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(os.Stderr, os.Stdout, "failed to read stdin", err)
		os.Exit(1)
	}

	if len(input) == 0 {
		writeError(os.Stderr, os.Stdout, "empty stdin: expected JSON compile request", nil)
		os.Exit(1)
	}

	var req ir.CompileRequest
	if err := json.Unmarshal(input, &req); err != nil {
		writeError(os.Stderr, os.Stdout, "invalid JSON request", err)
		os.Exit(1)
	}

	if req.Operation != "preview" && req.Operation != "download" {
		writeError(os.Stderr, os.Stdout, fmt.Sprintf("unsupported operation %q (expected preview or download)", req.Operation), nil)
		os.Exit(1)
	}

	// Compile
	result, err := engine.Compile(&req)
	if err != nil {
		// Write structured error to stdout for the adapter to parse
		resp := ir.ErrorResponse{
			Error: err.Error(),
		}
		if result != nil {
			resp.Diagnostics = result.Diagnostics
		}
		data, _ := json.Marshal(resp)
		os.Stdout.Write(data)
		fmt.Fprintln(os.Stderr, "compilation failed:", err)
		os.Exit(1)
	}

	switch req.Operation {
	case "preview":
		preview := ir.PreviewResponse{
			OpenAPI:         result.OpenAPI,
			Files:           engine.ToPreviewFiles(result.Files),
			Diagnostics:     result.Diagnostics,
			CompilerVersion: Version,
		}
		data, err := json.Marshal(preview)
		if err != nil {
			writeError(os.Stderr, os.Stdout, "failed to marshal preview response", err)
			os.Exit(1)
		}
		os.Stdout.Write(data)

	case "download":
		// Raw ZIP bytes to stdout; diagnostics/logs to stderr only
		zipData, err := engine.BuildZip(result.Files)
		if err != nil {
			writeError(os.Stderr, os.Stdout, "failed to build zip", err)
			os.Exit(1)
		}
		if _, err := os.Stdout.Write(zipData); err != nil {
			fmt.Fprintln(os.Stderr, "failed to write zip to stdout:", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "zip written: %d bytes, %d files\n", len(zipData), len(result.Files))
	}
}

// writeError writes a structured error JSON to stdout and a human-readable message to stderr.
func writeError(stderr, stdout *os.File, message string, err error) {
	fullMsg := message
	if err != nil {
		fullMsg = fmt.Sprintf("%s: %v", message, err)
	}
	resp := ir.ErrorResponse{Error: fullMsg}
	data, _ := json.Marshal(resp)
	stdout.Write(data)
	fmt.Fprintln(stderr, "error:", fullMsg)
}
