#!/bin/bash
# Re-translate PlusCal to TLA+
pcal tla/AsyncOfferPull.tla

# Run Model Checker
# -workers auto: Use all cores
# -deadlock: Check for deadlocks
tlc tla/AsyncOfferPull.tla -config tla/AsyncOfferPull.cfg -workers auto
