FROM gcc:13-bookworm AS cpp-builder

WORKDIR /build
COPY cpp_core ./cpp_core
RUN g++ -std=c++17 -O2 -shared -fPIC \
    cpp_core/traceroute_core.cpp -o cpp_core/libtraceroute.so


FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# matching-engine is a private repo, so the git clone pip runs needs a
# token — passed as a BuildKit secret (not a build-arg) so it never lands
# in an image layer.
RUN --mount=type=secret,id=gh_token \
    git config --global url."https://$(cat /run/secrets/gh_token)@github.com/".insteadOf "https://github.com/" \
    && pip install --no-cache-dir -r requirements.txt \
    && git config --global --unset url."https://$(cat /run/secrets/gh_token)@github.com/".insteadOf

COPY app ./app
COPY static ./static
COPY --from=cpp-builder /build/cpp_core/libtraceroute.so ./cpp_core/libtraceroute.so

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
