# Proof: marker render idempotence

Establishes that `corpus render` can run repeatedly without drift, which is what
makes it safe to run on every change.

Run: `node run.mjs` — exits 0 on success.

## Trust boundary

`runProof` (`tools/corpus/proofs.mjs`) executes this proof's `command` from
`proof.yaml` with a shell. Proof manifests are repository content, like scripts —
running a proof executes whatever command its manifest names, the same way running
any other script in this repo would. There is no sandboxing around it.
