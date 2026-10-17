package main

import (
	"testing"
)

func TestVersion(t *testing.T) {
	expected := "1.0.0"
	if Version != expected {
		t.Fatalf("expected version %s, got %s", expected, Version)
	}
}
