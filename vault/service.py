#!/usr/bin/env python3
"""
The vault: guest care data that never reaches a hosted service.

Wraps XTrace's x-vec SDK behind a small local HTTP interface so the Node agent
can use it. Content is AES-encrypted and the embedding vector is encrypted with
Paillier before anything leaves this process; the server computes Hamming
distances over ciphertext and returns chunk ids, which are decrypted here.

Run it:
    cd vault
    python -m venv .venv && source .venv/bin/activate    # Windows: .venv\\Scripts\\activate
    pip install -r requirements.txt
    python service.py

Then set MISE_VAULT_URL=http://127.0.0.1:8787 in ../.env (it is the default).

If you skip this entirely, the Node side falls back to an AES-encrypted file and
the demo still runs. The fallback is local too — the conservative failure for
this class of data is to keep it here, not to send it somewhere.
"""

import asyncio
import json
import os
import pathlib
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = pathlib.Path(__file__).resolve().parent
CTX_PATH = ROOT / "data" / "exec_context"
PASSPHRASE = os.environ.get("MISE_VAULT_PASSPHRASE", "mise-demo-passphrase")
KB_ID = os.environ.get("MISE_VAULT_KB_ID", "")
PORT = int(os.environ.get("MISE_VAULT_PORT", "8787"))
EMBED_DIM = 512

state = {"ready": False, "chunks": 0, "error": None}


# ------------------------------------------------------------------ x-vec setup


async def build():
    """Create or reload the execution context, embedding model, and XTrace client."""
    from xtrace_sdk.x_vec.utils.execution_context import ExecutionContext
    from xtrace_sdk.x_vec.crypto.key_provider import PassphraseKeyProvider
    from xtrace_sdk.x_vec.inference.embedding import Embedding
    from xtrace_sdk.integrations.xtrace import XTraceIntegration

    provider = PassphraseKeyProvider(PASSPHRASE)

    if CTX_PATH.exists():
        ctx = ExecutionContext.load_from_disk(PASSPHRASE, str(CTX_PATH))
        print(f"  reloaded execution context {ctx.id}")
    else:
        CTX_PATH.parent.mkdir(parents=True, exist_ok=True)
        ctx = ExecutionContext.create(
            key_provider=provider,
            homomorphic_client_type="paillier_lookup",  # fastest CPU option
            embedding_length=EMBED_DIM,
            key_len=1024,
            path=str(CTX_PATH),
        )
        print(f"  created execution context {ctx.id}")
        print("  keep this directory — losing it means losing the ability to decrypt")

    embed = Embedding("sentence_transformer", "mixedbread-ai/mxbai-embed-large-v1", dim=EMBED_DIM)
    xtrace = XTraceIntegration(
        org_id=os.environ.get("XTRACE_ORG_ID", ""),
        api_key=os.environ.get("XTRACE_API_KEY", ""),
    )
    return ctx, embed, xtrace


async def store_chunks(ctx, embed, xtrace, chunks):
    from xtrace_sdk.x_vec.data_loaders.loader import DataLoader

    loader = DataLoader(ctx, xtrace)
    docs = [
        {
            "chunk_content": c["text"],
            "meta_data": {
                "tag1": c.get("guest_id") or "house",
                "tag2": "guest-care",
                "facets": c.get("tags", []),
            },
        }
        for c in chunks
    ]
    vectors = [embed.bin_embed(d["chunk_content"]) for d in docs]
    index, db = await loader.load_data_from_memory(docs, vectors)
    await loader.dump_db(db, index=index, kb_id=KB_ID)
    return len(docs)


async def query_chunks(ctx, embed, xtrace, query, k):
    from xtrace_sdk.x_vec.retrievers.retriever import Retriever

    retriever = Retriever(ctx, xtrace)
    vec = await embed.bin_embed(query)
    ids = await retriever.nn_search_for_ids(vec, k=k, kb_id=KB_ID)
    rows = await retriever.retrieve_and_decrypt(ids, kb_id=KB_ID)
    return [
        {
            "id": str(r.get("id", i)),
            "text": r["chunk_content"],
            "guest_id": (r.get("meta_data") or {}).get("tag1"),
            "tags": (r.get("meta_data") or {}).get("facets", []),
        }
        for i, r in enumerate(rows)
    ]


# ------------------------------------------------------------------ http


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # quiet; the agent's own output is the interesting one

    def do_GET(self):
        if self.path == "/health":
            self._send(200 if state["ready"] else 503, {
                "ready": state["ready"],
                "chunks": state["chunks"],
                "backend": "x-vec",
                "error": state["error"],
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        loop = self.server.loop
        ctx, embed, xtrace = self.server.xvec

        try:
            if self.path == "/chunks":
                chunks = body.get("chunks", [])
                n = loop.run_until_complete(store_chunks(ctx, embed, xtrace, chunks))
                state["chunks"] += n
                self._send(200, {"stored": n})
            elif self.path == "/query":
                results = loop.run_until_complete(
                    query_chunks(ctx, embed, xtrace, body.get("query", ""), int(body.get("k", 4)))
                )
                self._send(200, {"results": results})
            else:
                self._send(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001 — surface it to the agent, do not crash the vault
            self._send(500, {"error": str(exc)})


def main():
    if not KB_ID:
        print("  MISE_VAULT_KB_ID is not set.")
        print("  Create a knowledge base first:  xtrace kb create mise-vault")
        print("  Then export the id it prints, or put it in ../.env")
        sys.exit(1)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    print("\n  MISE vault · x-vec\n")
    try:
        xvec = loop.run_until_complete(build())
    except Exception as exc:  # noqa: BLE001
        print(f"  could not start: {exc}")
        print("  the Node agent will fall back to its local AES file, which is also fine")
        sys.exit(1)

    state["ready"] = True
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.loop = loop
    server.xvec = xvec
    print(f"  listening on http://127.0.0.1:{PORT}")
    print("  content AES-encrypted, vectors Paillier-encrypted, both before they leave this process\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
