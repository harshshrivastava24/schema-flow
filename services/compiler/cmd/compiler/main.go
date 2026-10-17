package main

import (
	"flag"
	"fmt"
)

const Version = "1.0.0"

func main() {
	versionFlag := flag.Bool("version", false, "print compiler version")
	flag.Parse()

	if *versionFlag {
		fmt.Printf(`{"status":"ok","version":"%s"}`+"\n", Version)
		return
	}

	fmt.Println(`{"status":"ok","message":"BackendGen Go Compiler Ready"}`)
}
