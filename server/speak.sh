#!/bin/sh
espeak --stdout -v fr "$1" | sox -t .wav - -t .$2 - pitch 800 speed 0.6
