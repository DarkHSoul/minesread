import io.netty.buffer.Unpooled;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.TypedDataComponent;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.server.Bootstrap;

/** Exports factual vanilla default component bytes using Mojang's own codecs. */
public class ExportComponents {
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        var access = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        var world = VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(world).forEach(pending -> pending.apply());
        var lines = new ArrayList<String>();

        for (var item : BuiltInRegistries.ITEM) {
            var values = new ArrayList<String>();
            for (var component : item.components()) {
                var type = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type());
                if (component.type().streamCodec() == null) {
                    values.add("!" + type);
                    continue;
                }
                var buffer = new RegistryFriendlyByteBuf(Unpooled.buffer(), access);
                try {
                    TypedDataComponent.STREAM_CODEC.encode(buffer, component);
                    var bytes = new byte[buffer.readableBytes()];
                    buffer.readBytes(bytes);
                    values.add(Base64.getEncoder().encodeToString(bytes));
                } catch (Exception exception) {
                    values.add("!" + type);
                    System.err.println(BuiltInRegistries.ITEM.getKey(item) + " " + type + " " + exception);
                } finally {
                    buffer.release();
                }
            }
            lines.add(BuiltInRegistries.ITEM.getKey(item) + "\t" + String.join(",", values));
        }
        Files.write(Path.of(args[0]), lines);
        System.exit(0);
    }
}
