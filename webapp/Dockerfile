FROM gcc:13-bookworm AS cpp-builder

WORKDIR /build
COPY cpp_core ./cpp_core
RUN g++ -std=c++17 -O2 -shared -fPIC \
    cpp_core/traceroute_core.cpp -o cpp_core/libtraceroute.so


FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY --from=cpp-builder /build/cpp_core/libtraceroute.so ./cpp_core/libtraceroute.so

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
