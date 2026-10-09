# One-off job image: deploys the ChainChat contracts and writes shared/deployments/{NETWORK}.json.
FROM ghcr.io/foundry-rs/foundry:stable

# Layout mirrors the repo so the script's ../shared/deployments path works; that folder is a mounted volume.
USER root
RUN mkdir -p /workspace/contracts /workspace/shared/deployments && chown -R foundry:foundry /workspace
USER foundry
WORKDIR /workspace/contracts

# Dependencies and the Solidity compiler are fetched at build time, so the container works offline.
COPY --chown=foundry:foundry foundry.toml soldeer.lock ./
RUN forge soldeer install </dev/null

COPY --chown=foundry:foundry src ./src
COPY --chown=foundry:foundry script ./script
COPY --chown=foundry:foundry deploy.sh ./
RUN forge build

ENTRYPOINT ["./deploy.sh"]
