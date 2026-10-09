using System.Text.Json;
using ChainChat.Core.Crypto;

namespace ChainChat.Core.Tests.Vectors;

/// <summary>Loads the shared JSON test vectors from shared/test-vectors/vectors/ (copied next to the test assembly).</summary>
internal static class VectorFile
{
    public static JsonElement Load(string fileName)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "vectors", fileName);
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.Clone();
    }

    /// <summary>Case names of one array in a vector file, as xUnit theory data, so every case is reported separately.</summary>
    public static TheoryData<string> CaseNames(string fileName, string arrayName = "cases")
    {
        var data = new TheoryData<string>();
        foreach (var item in Load(fileName).GetProperty(arrayName).EnumerateArray())
        {
            data.Add(item.GetProperty("name").GetString()!);
        }
        return data;
    }

    public static JsonElement Case(string fileName, string name, string arrayName = "cases") =>
        Load(fileName).GetProperty(arrayName).EnumerateArray().Single(item => item.GetProperty("name").GetString() == name);

    public static string Str(this JsonElement element, string property) => element.GetProperty(property).GetString()!;

    public static byte[] Bytes(this JsonElement element, string property) => Hex.ToBytes(element.Str(property));

    public static ulong UInt64(this JsonElement element, string property) => ulong.Parse(element.Str(property));

    public static List<byte[]> BytesList(this JsonElement element, string property) =>
        element.GetProperty(property).EnumerateArray().Select(item => Hex.ToBytes(item.GetString()!)).ToList();
}
