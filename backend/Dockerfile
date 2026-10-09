# ---- Build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first, using only project files, so the package layer is cached between code changes.
COPY Directory.Build.props ./
COPY src/ChainChat.Api/ChainChat.Api.csproj src/ChainChat.Api/
COPY src/ChainChat.Core/ChainChat.Core.csproj src/ChainChat.Core/
COPY src/ChainChat.Infrastructure/ChainChat.Infrastructure.csproj src/ChainChat.Infrastructure/
RUN dotnet restore src/ChainChat.Api/ChainChat.Api.csproj

COPY src/ src/
RUN dotnet publish src/ChainChat.Api/ChainChat.Api.csproj -c Release -o /app --no-restore

# ---- Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Run as the image's built-in non-root user.
USER $APP_UID
ENTRYPOINT ["dotnet", "ChainChat.Api.dll"]
